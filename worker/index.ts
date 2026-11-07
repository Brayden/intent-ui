import type { Env } from "./env";
import { errorResponse, HttpError } from "./lib/http";
import { handleAmend } from "./routes/amend";
import { handleCompose } from "./routes/compose";
import {
  addConnection,
  connectionActivity,
  listConnections,
  oauthCallback,
  reauthorize,
  refreshConnection,
  removeConnection,
  updateToolPolicy,
} from "./routes/connections";
import { loadRegistry, withRegistry } from "./connections/registry";
import { handleGeneratePage } from "./routes/pages";
import { handleMaterialize } from "./routes/intents";
import { handleResearchRefresh } from "./routes/research";
import { handleToolCall } from "./routes/tools";
import {
  createWorkspace,
  deleteWorkspace,
  getDocument,
  getWorkspace,
  listWorkspaces,
  postChange,
  putTemplate,
  refreshData,
  saveWorkspace,
  type Params,
} from "./routes/workspaces";

export { ConnectionsStore } from "./store/ConnectionsStore";
export { WorkspaceDirectory } from "./store/WorkspaceDirectory";
export { WorkspaceStore } from "./store/WorkspaceStore";

type Handler = (request: Request, env: Env, params: Params) => Promise<Response> | Response;
type Route = [method: string, pattern: string, handler: Handler];

/** Routing only; handlers live in routes/. Everything outside /api/* is static assets. */
const routes: Route[] = [
  ["GET", "/api/health", () => Response.json({ ok: true, service: "intent-ui" })],
  ["GET", "/api/workspaces", listWorkspaces],
  ["POST", "/api/workspaces", createWorkspace],
  ["GET", "/api/workspaces/:id", getWorkspace],
  ["PUT", "/api/workspaces/:id", saveWorkspace],
  ["DELETE", "/api/workspaces/:id", deleteWorkspace],
  ["POST", "/api/workspaces/:id/data", refreshData],
  ["GET", "/api/workspaces/:id/document", getDocument],
  ["POST", "/api/workspaces/:id/changes", postChange],
  ["POST", "/api/workspaces/:id/templates", putTemplate],
  ["POST", "/api/workspaces/:id/compose", handleCompose],
  ["POST", "/api/workspaces/:id/pages", handleGeneratePage],
  ["POST", "/api/workspaces/:id/sources/:sourceId/research", handleResearchRefresh],
  ["POST", "/api/intents/materialize", handleMaterialize],
  ["POST", "/api/intents/amend", handleAmend],
  ["POST", "/api/tools/call", handleToolCall],
  ["GET", "/api/connections", listConnections],
  ["POST", "/api/connections", addConnection],
  ["GET", "/api/connections/oauth/callback", oauthCallback],
  ["POST", "/api/connections/:id/authorize", reauthorize],
  ["POST", "/api/connections/:id/refresh", refreshConnection],
  ["PUT", "/api/connections/:id/tools/:tool", updateToolPolicy],
  ["GET", "/api/connections/:id/activity", connectionActivity],
  ["DELETE", "/api/connections/:id", removeConnection],
];

/** Matches "/api/workspaces/:id" style patterns; returns params or null. */
function match(pattern: string, pathname: string): Params | null {
  const want = pattern.split("/");
  const got = pathname.split("/");
  if (want.length !== got.length) return null;
  const params: Params = {};
  for (let i = 0; i < want.length; i++) {
    const part = want[i] ?? "";
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(got[i] ?? "");
    else if (part !== got[i]) return null;
  }
  return params;
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      for (const [method, pattern, handler] of routes) {
        const params = request.method === method ? match(pattern, pathname) : null;
        // Each request sees the user's live connections, behind the gatekeeper (ADR 0014).
        if (params) {
          const registry = pathname.startsWith("/api/connections") ? undefined : await loadRegistry(env);
          return await (registry ? withRegistry(registry, () => handler(request, env, params)) : handler(request, env, params));
        }
      }
      throw new HttpError(404, "Not found");
    } catch (error) {
      return errorResponse(error);
    }
  },
} satisfies ExportedHandler<Env>;
