import { PRESETS, type Access, type ActivityEntry, type AuthKind, type ConnectionStatus, type ConnectionSummary, type CreateConnectionRequest } from "../../shared/api";
import type { Env } from "../env";
import { HttpError } from "../lib/http";
import { McpAuthError, McpClient, type McpTool } from "../mcp/client";
import {
  authorizationUrl,
  discover,
  exchangeCode,
  pkceChallenge,
  randomToken,
  refreshTokens,
  registerClient,
  type Discovery,
  type OAuthClient,
  type Tokens,
} from "../mcp/oauth";
import { governTool, type ToolPolicy } from "./policy";

/** A connection as stored, credentials included. Never sent to the browser as is (see `summarize`). */
export type StoredConnection = {
  id: string;
  name: string;
  url: string;
  auth: AuthKind;
  /** Older connections predate access levels: treated as "write" (tools as the server describes them). */
  access?: Access;
  preset?: string;
  status: ConnectionStatus;
  error?: string;
  /** `token` auth: sent as `Authorization: Bearer …`. */
  token?: string;
  /** `oauth` auth: the client (registered or the user's own app), where to sign in, and tokens. */
  client?: OAuthClient;
  /** True when `client` is the user's own OAuth app (kept as is); else it was registered for `clientRedirectUri`. */
  ownClient?: boolean;
  clientRedirectUri?: string;
  discovery?: Discovery;
  tokens?: Tokens;
  tools: McpTool[];
  toolsUpdatedAt?: string;
  policy: Record<string, ToolPolicy>;
};

/** An OAuth sign-in in progress. `returnTo` is the page to send the user back to afterwards. */
type Pending = { id: string; verifier: string; redirectUri: string; returnTo?: string };

/** One user for now; becomes the signed-in user's id once identity lands. */
export const connectionsStore = (env: Env) => env.CONNECTIONS.get(env.CONNECTIONS.idFromName(env.user));

export async function listStored(env: Env): Promise<StoredConnection[]> {
  return (await connectionsStore(env).list()).map((json) => JSON.parse(json) as StoredConnection);
}

export async function getStored(env: Env, id: string): Promise<StoredConnection> {
  const json = await connectionsStore(env).get(id);
  if (!json) throw new HttpError(404, `No connection "${id}"`);
  return JSON.parse(json) as StoredConnection;
}

const save = (env: Env, connection: StoredConnection) => connectionsStore(env).put(connection.id, JSON.stringify(connection));

/** What the browser sees: no credentials. */
export function summarize(connection: StoredConnection): ConnectionSummary {
  return {
    id: connection.id,
    name: connection.name,
    url: connection.url,
    auth: connection.auth,
    access: effectiveAccess(connection),
    grantedReadOnly: connection.access !== "read" && grantIsReadOnly(connection),
    preset: connection.preset,
    status: connection.status,
    error: connection.error,
    tools: connection.tools.map((tool) => governTool(connection.id, tool, connection.policy[tool.name], effectiveAccess(connection))),
    toolsUpdatedAt: connection.toolsUpdatedAt,
  };
}

/**
 * Scopes that only read: "read", "workers:read", "workers-scripts.read", "d1.metadata_read",
 * "….monitoring", "….report" (viewing reports), plus what sign-in itself needs.
 */
const READ_SCOPE = /(^|[:._-])(read|metadata_read|content_read|monitoring|report)$|^read([:._-]|$)|^(offline_access|openid|profile|email)$/i;

/** True when an OAuth grant lists scopes and every one of them only reads. */
export function grantIsReadOnly(connection: StoredConnection): boolean {
  const scopes = connection.tokens?.scope?.split(/\s+/).filter(Boolean) ?? [];
  return connection.auth === "oauth" && scopes.length > 0 && scopes.every((scope) => READ_SCOPE.test(scope));
}

/**
 * What the connection can actually do (ADR 0015): read-only when chosen, or when the service
 * granted only read permissions whatever was chosen (the credential can't change anything).
 */
export function effectiveAccess(connection: StoredConnection): Access {
  return connection.access === "read" || grantIsReadOnly(connection) ? "read" : "write";
}

/**
 * Scopes to ask for: everything the server lists for read & write; only read scopes for a
 * read-only connection (ADR 0015). Servers that list no scopes get none (their default).
 */
export function requestedScopes(discovery: Discovery, access: Access): string | undefined {
  const all = discovery.scopes ?? discovery.metadata.scopes_supported ?? [];
  const chosen = access === "read" ? all.filter((scope) => READ_SCOPE.test(scope)) : all;
  return chosen.length > 0 ? chosen.join(" ") : undefined;
}

const redirectUriFor = (env: Env, origin: string) => `${origin}${env.basePath}/connections/oauth/callback`;

function idFor(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "connection";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Adds (or, for a preset, reconnects) a connection. OAuth returns the URL to sign in at. */
export async function createConnection(
  env: Env,
  request: CreateConnectionRequest,
  origin: string,
  returnTo?: string,
): Promise<{ connection: StoredConnection; authUrl?: string }> {
  const preset = PRESETS.find((candidate) => candidate.id === request.preset);
  if (request.preset && !preset) throw new HttpError(400, `Unknown preset "${request.preset}"`);
  const url = request.url ?? preset?.url;
  if (!url) throw new HttpError(400, "An MCP server URL is required");
  if (request.auth === "token" && !request.token) throw new HttpError(400, "Paste an access token, or choose another sign-in method");
  if (request.auth === "oauth" && preset?.oauthNeedsClient && !request.clientId) {
    throw new HttpError(400, `${preset.name} doesn't support automatic sign-in setup: enter your OAuth app's client ID and secret, or use a token`);
  }

  const existing = await listStored(env);
  const name = request.name ?? preset?.name ?? new URL(url).hostname;
  const id = preset ? preset.id : idFor(name, new Set(existing.map((connection) => connection.id)));
  const previous = existing.find((connection) => connection.id === id);
  const connection: StoredConnection = {
    id,
    name,
    url,
    auth: request.auth,
    access: request.access ?? "read",
    preset: preset?.id,
    status: "needs_auth",
    token: request.token,
    client: request.clientId ? { clientId: request.clientId, clientSecret: request.clientSecret } : previous?.client,
    ownClient: request.clientId ? true : previous?.ownClient,
    clientRedirectUri: request.clientId ? undefined : previous?.clientRedirectUri,
    tools: previous?.tools ?? [],
    // A new access level means new defaults: drop old per-tool read/write overrides.
    policy: previous && (previous.access ?? "write") === (request.access ?? "read") ? previous.policy : {},
  };

  if (request.auth === "oauth") {
    const authUrl = await startAuthorization(env, connection, origin, returnTo);
    return { connection: await getStored(env, id), authUrl };
  }
  return { connection: await connect(env, connection) };
}

/**
 * Starts an OAuth sign-in: finds the authorization server (from the server's 401 hint or its
 * metadata), registers a client unless we have one, and returns the authorization URL.
 */
export async function startAuthorization(env: Env, connection: StoredConnection, origin: string, returnTo?: string): Promise<string> {
  let hint: string | undefined;
  try {
    await new McpClient({ url: connection.url, timeoutMs: 15_000 }).listTools();
  } catch (error) {
    if (error instanceof McpAuthError) hint = error.resourceMetadata;
  }
  const redirectUri = redirectUriFor(env, origin);
  const discovery = await discover(connection.url, hint);
  // A registered client is tied to its redirect URI: register again if the app's address changed.
  const reuse = connection.client && (connection.ownClient || connection.clientRedirectUri === redirectUri);
  const client = reuse && connection.client ? connection.client : await registerClient(discovery.metadata, redirectUri);
  const verifier = randomToken();
  const state = randomToken(16);
  await save(env, { ...connection, discovery, client, clientRedirectUri: connection.ownClient ? undefined : redirectUri, status: "needs_auth", error: undefined });
  const pending: Pending = { id: connection.id, verifier, redirectUri, returnTo };
  await connectionsStore(env).putPending(state, JSON.stringify(pending));
  const scope = requestedScopes(discovery, connection.access ?? "write");
  return authorizationUrl(discovery, client, { redirectUri, challenge: await pkceChallenge(verifier), state, scope });
}

/** Finishes a sign-in from the OAuth callback, then connects. */
export async function completeAuthorization(env: Env, state: string, code: string): Promise<{ connection: StoredConnection; returnTo?: string }> {
  const json = await connectionsStore(env).takePending(state);
  if (!json) throw new HttpError(400, "This sign-in expired or was already used. Try connecting again.");
  const pending = JSON.parse(json) as Pending;
  const connection = await getStored(env, pending.id);
  if (!connection.discovery || !connection.client) throw new HttpError(400, "Sign-in wasn't started for this connection");
  try {
    const tokens = await exchangeCode(connection.discovery, connection.client, { code, verifier: pending.verifier, redirectUri: pending.redirectUri });
    return { connection: await connect(env, { ...connection, tokens }), returnTo: pending.returnTo };
  } catch (error) {
    await save(env, { ...connection, status: "error", error: (error as Error).message });
    throw error;
  }
}

/** Marks a pending sign-in as failed (the user declined, or the server returned an error). */
export async function failAuthorization(env: Env, state: string, message: string): Promise<{ id: string; returnTo?: string } | undefined> {
  const json = await connectionsStore(env).takePending(state);
  if (!json) return undefined;
  const { id, returnTo } = JSON.parse(json) as Pending;
  const connection = await getStored(env, id);
  await save(env, { ...connection, status: "needs_auth", error: message });
  return { id, returnTo };
}

/** Headers for a call, refreshing an expiring OAuth token first. */
async function authHeaders(env: Env, connection: StoredConnection): Promise<Record<string, string>> {
  if (connection.auth === "none") return {};
  if (connection.auth === "token") return { authorization: `Bearer ${connection.token ?? ""}` };
  if (!connection.tokens) throw new McpAuthError("Sign in to use this connection");
  if (connection.tokens.expiresAt && connection.tokens.expiresAt < Date.now() + 60_000 && connection.tokens.refreshToken) {
    await refresh(env, connection);
  }
  return { authorization: `Bearer ${connection.tokens.accessToken}` };
}

async function refresh(env: Env, connection: StoredConnection): Promise<void> {
  if (!connection.discovery || !connection.client || !connection.tokens?.refreshToken) throw new McpAuthError("Sign in again");
  connection.tokens = await refreshTokens(connection.discovery, connection.client, connection.tokens.refreshToken);
  await save(env, connection);
}

/**
 * Runs `work` with an authenticated client. On a 401 an OAuth connection refreshes its token
 * and retries once; if that fails it's marked as needing sign-in.
 */
async function withClient<T>(env: Env, connection: StoredConnection, work: (client: McpClient) => Promise<T>): Promise<T> {
  const client = () => new McpClient({ url: connection.url, headers: () => authHeaders(env, connection) });
  try {
    return await work(client());
  } catch (error) {
    if (!(error instanceof McpAuthError)) throw error;
    if (connection.auth === "oauth" && connection.tokens?.refreshToken) {
      try {
        await refresh(env, connection);
        return await work(client());
      } catch {
        // fall through: needs sign-in
      }
    }
    await save(env, { ...connection, status: "needs_auth", error: "Sign in again to keep using this connection" });
    throw new HttpError(401, `${connection.name} needs you to sign in again (Connections, on the home page)`);
  }
}

/** Lists the server's tools and marks the connection connected (or records why not). */
export async function connect(env: Env, connection: StoredConnection): Promise<StoredConnection> {
  try {
    const tools = await withClient(env, connection, (client) => client.listTools());
    const connected: StoredConnection = { ...connection, tools, toolsUpdatedAt: new Date().toISOString(), status: "connected", error: undefined };
    await save(env, connected);
    return connected;
  } catch (error) {
    const failed: StoredConnection = {
      ...(await getStored(env, connection.id).catch(() => connection)),
      status: error instanceof HttpError && error.status === 401 ? "needs_auth" : "error",
      error: (error as Error).message,
    };
    await save(env, failed);
    return failed;
  }
}

export function callConnectionTool(env: Env, connection: StoredConnection, tool: string, args: Record<string, unknown>): Promise<unknown> {
  return withClient(env, connection, (client) => client.callTool(tool, args));
}

export async function setToolPolicy(env: Env, id: string, tool: string, policy: ToolPolicy): Promise<StoredConnection> {
  const connection = await getStored(env, id);
  if (!connection.tools.some((candidate) => candidate.name === tool)) throw new HttpError(404, `${connection.name} has no tool "${tool}"`);
  const next = { ...connection, policy: { ...connection.policy, [tool]: { ...connection.policy[tool], ...policy } } };
  await save(env, next);
  return next;
}

export async function logActivity(env: Env, entry: ActivityEntry): Promise<void> {
  await connectionsStore(env).logActivity(entry.connection, JSON.stringify(entry));
}

export async function listActivity(env: Env, id: string): Promise<ActivityEntry[]> {
  return (await connectionsStore(env).activity(id, 100)).map((json) => JSON.parse(json) as ActivityEntry);
}
