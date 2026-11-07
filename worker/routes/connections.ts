import {
  CreateConnectionRequestSchema,
  ToolPolicyRequestSchema,
  type ConnectionSummary,
  type CreateConnectionResponse,
} from "../../shared/api";
import { builtinSummaries } from "../connections/registry";
import {
  completeAuthorization,
  connect,
  connectionsStore,
  createConnection,
  failAuthorization,
  getStored,
  listActivity,
  listStored,
  setToolPolicy,
  startAuthorization,
  summarize,
} from "../connections/service";
import type { Env } from "../env";
import { HttpError, readJson } from "../lib/http";
import type { Params } from "./workspaces";

const originOf = (request: Request) => new URL(request.url).origin;

/** GET /api/connections — the user's connections, then the built-ins. */
export async function listConnections(_request: Request, env: Env): Promise<Response> {
  const stored = await listStored(env);
  const body: ConnectionSummary[] = [...stored.map(summarize), ...builtinSummaries(stored)];
  return Response.json(body);
}

/** POST /api/connections — add (or reconnect) one; OAuth answers with the URL to sign in at. */
export async function addConnection(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, CreateConnectionRequestSchema);
  const { connection, authUrl } = await createConnection(env, body, originOf(request));
  const response: CreateConnectionResponse = { connection: summarize(connection), authUrl };
  return Response.json(response, { status: 201 });
}

/** POST /api/connections/:id/authorize — sign in again (OAuth). */
export async function reauthorize(request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  const connection = await getStored(env, id);
  if (connection.auth !== "oauth") throw new HttpError(400, `${connection.name} uses a token: reconnect it with a new one`);
  return Response.json({ authUrl: await startAuthorization(env, connection, originOf(request)) });
}

/** GET /api/connections/oauth/callback — where the authorization server sends the user back. */
export async function oauthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const back = (params: Record<string, string>) => Response.redirect(`${url.origin}/?${new URLSearchParams(params)}`, 302);
  if (!code) {
    const message = url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "Sign-in was cancelled";
    const id = await failAuthorization(env, state, message);
    return back({ connection: id ?? "", status: "error", message });
  }
  try {
    const connection = await completeAuthorization(env, state, code);
    return back({ connection: connection.id, status: connection.status, message: connection.error ?? "" });
  } catch (error) {
    return back({ status: "error", message: (error as Error).message });
  }
}

/** POST /api/connections/:id/refresh — reconnect and re-list its tools. */
export async function refreshConnection(_request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  return Response.json(summarize(await connect(env, await getStored(env, id))));
}

/** PUT /api/connections/:id/tools/:tool — turn a tool on/off, or correct read vs write. */
export async function updateToolPolicy(request: Request, env: Env, { id = "", tool = "" }: Params): Promise<Response> {
  const policy = await readJson(request, ToolPolicyRequestSchema);
  return Response.json(summarize(await setToolPolicy(env, id, tool, policy)));
}

/** GET /api/connections/:id/activity — the gatekeeper's log of calls. */
export async function connectionActivity(_request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  return Response.json(await listActivity(env, id));
}

/** DELETE /api/connections/:id — forget it and its credentials. */
export async function removeConnection(_request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  await getStored(env, id);
  await connectionsStore(env).remove(id);
  return new Response(null, { status: 204 });
}
