/*
 * OAuth 2.1 for MCP servers (MCP authorization spec 2025-06-18): find the authorization server
 * from the server's protected-resource metadata, register as a client dynamically (RFC 7591)
 * unless one is pre-registered, then authorization code + PKCE, with refresh. No dependencies.
 */

export type AuthServerMetadata = {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
};

/** Where and how to sign in for one MCP server. */
export type Discovery = {
  /** The protected resource (sent as `resource`, RFC 8707). */
  resource: string;
  metadata: AuthServerMetadata;
  /** Scopes the resource says it supports, if any. */
  scopes?: string[];
};

export type OAuthClient = { clientId: string; clientSecret?: string };
export type Tokens = { accessToken: string; refreshToken?: string; expiresAt?: number; scope?: string };

export class OAuthError extends Error {}

type Fetch = typeof fetch;

async function getJson<T>(doFetch: Fetch, url: string): Promise<T | undefined> {
  try {
    const response = await doFetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

/** `/.well-known/<name>` for a URL, path-inserted (RFC 8414 §3) first, then at the root. */
function wellKnown(url: string, name: string): string[] {
  const { origin, pathname } = new URL(url);
  const path = pathname.replace(/\/+$/, "");
  return [...(path ? [`${origin}/.well-known/${name}${path}`] : []), `${origin}/.well-known/${name}`];
}

/** Finds the authorization server for an MCP server URL. */
export async function discover(serverUrl: string, resourceMetadataHint?: string, doFetch: Fetch = fetch): Promise<Discovery> {
  type Prm = { resource?: string; authorization_servers?: string[]; scopes_supported?: string[] };
  let prm: Prm | undefined;
  for (const url of [...(resourceMetadataHint ? [resourceMetadataHint] : []), ...wellKnown(serverUrl, "oauth-protected-resource")]) {
    prm = await getJson<Prm>(doFetch, url);
    if (prm?.authorization_servers?.length) break;
  }
  // Older servers (spec 2025-03-26) have no resource metadata: the server's origin is the issuer.
  const issuer = prm?.authorization_servers?.[0] ?? new URL(serverUrl).origin;

  let metadata: AuthServerMetadata | undefined;
  for (const url of [...wellKnown(issuer, "oauth-authorization-server"), ...wellKnown(issuer, "openid-configuration")]) {
    metadata = await getJson<AuthServerMetadata>(doFetch, url);
    if (metadata?.authorization_endpoint && metadata.token_endpoint) break;
    metadata = undefined;
  }
  if (!metadata) {
    const origin = new URL(issuer).origin;
    metadata = { authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register` };
  }
  return { resource: prm?.resource ?? serverUrl, metadata, scopes: prm?.scopes_supported };
}

/** Registers this app as an OAuth client (RFC 7591). */
export async function registerClient(metadata: AuthServerMetadata, redirectUri: string, doFetch: Fetch = fetch): Promise<OAuthClient> {
  if (!metadata.registration_endpoint) {
    throw new OAuthError("This server doesn't support automatic sign-in setup. Use an access token, or enter your own OAuth app's client ID and secret.");
  }
  const response = await doFetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "Intent UI",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!response.ok) throw new OAuthError(`Client registration failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as { client_id: string; client_secret?: string };
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** A random URL-safe string (state, PKCE verifier). */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

export function authorizationUrl(
  discovery: Discovery,
  client: OAuthClient,
  options: { redirectUri: string; challenge: string; state: string; scope?: string },
): string {
  const url = new URL(discovery.metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("code_challenge", options.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", options.state);
  url.searchParams.set("resource", discovery.resource);
  if (options.scope) url.searchParams.set("scope", options.scope);
  return url.toString();
}

/** Calls the token endpoint (code exchange or refresh), authenticating as the client. */
async function tokenRequest(discovery: Discovery, client: OAuthClient, params: Record<string, string>, doFetch: Fetch): Promise<Tokens> {
  const body = new URLSearchParams({ ...params, resource: discovery.resource });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  const methods = discovery.metadata.token_endpoint_auth_methods_supported;
  if (client.clientSecret && methods?.includes("client_secret_basic") && !methods.includes("client_secret_post")) {
    headers.authorization = `Basic ${btoa(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`)}`;
  } else {
    body.set("client_id", client.clientId);
    if (client.clientSecret) body.set("client_secret", client.clientSecret);
  }
  const response = await doFetch(discovery.metadata.token_endpoint, { method: "POST", headers, body });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // GitHub-style form responses
    json = Object.fromEntries(new URLSearchParams(text));
  }
  if (!response.ok || typeof json.access_token !== "string") {
    throw new OAuthError(`Token request failed (${response.status}): ${String(json.error_description ?? json.error ?? text).slice(0, 200)}`);
  }
  const expiresIn = Number(json.expires_in);
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}

export function exchangeCode(
  discovery: Discovery,
  client: OAuthClient,
  options: { code: string; verifier: string; redirectUri: string },
  doFetch: Fetch = fetch,
): Promise<Tokens> {
  return tokenRequest(
    discovery,
    client,
    { grant_type: "authorization_code", code: options.code, code_verifier: options.verifier, redirect_uri: options.redirectUri },
    doFetch,
  );
}

export async function refreshTokens(discovery: Discovery, client: OAuthClient, refreshToken: string, doFetch: Fetch = fetch): Promise<Tokens> {
  const tokens = await tokenRequest(discovery, client, { grant_type: "refresh_token", refresh_token: refreshToken }, doFetch);
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}
