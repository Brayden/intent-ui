import type { Bindings, Env } from "./env";
import type { Connection } from "./connections/types";
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

import { getHostPatches, postHostData, postHostEdit, putHostPatches } from "./routes/host";

/*
 * The Intent UI server: every API route behind one fetch handler that a Cloudflare Worker mounts
 * at any path. The standalone app (worker/index.ts) is one user of it; a host app embedding the
 * SDK is another. Requires Cloudflare: storage is the three Durable Objects in `Bindings`.
 */

export type IntentUIHandlerOptions = {
  /** Where requests are routed, e.g. "/intent-ui/api". Defaults to "/api". */
  basePath?: string;
  /**
   * Who's making the request, from the host's own session (a cookie, a header). Each user gets
   * their own workspaces, connections and customizations. Return null to reject (401).
   * Defaults to a single local user, for development.
   */
  session?: (request: Request, env: Bindings) => Promise<{ userId: string } | null> | { userId: string } | null;
  /**
   * Tools from the host's own API, offered next to the user's connections: for generated UI to read
   * the host's data (sources) and act on it (actions), through the same gatekeeper.
   */
  tools?: Connection[] | ((request: Request, env: Bindings, session: { userId: string }) => Connection[] | Promise<Connection[]>);
  /** Include the demo HR data source. Defaults to false. */
  demoData?: boolean;
};

/** Handles a request if it's under `basePath`; returns null otherwise so the host can handle it. */
export type IntentUIHandler = (request: Request, env: Bindings) => Promise<Response | null>;

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
  ["GET", "/api/host/patches", getHostPatches],
  ["PUT", "/api/host/patches", putHostPatches],
  ["POST", "/api/host/edit", postHostEdit],
  ["POST", "/api/host/data", postHostData],
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


const LOCAL_SESSION = { userId: "local" };

export function createIntentUIHandler(options: IntentUIHandlerOptions = {}): IntentUIHandler {
  const basePath = (options.basePath ?? "/api").replace(/\/+$/, "");
  return async (request, bindings) => {
    const url = new URL(request.url);
    if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return null;
    const pathname = `/api${url.pathname.slice(basePath.length)}`;
    try {
      const session = options.session ? await options.session(request, bindings) : LOCAL_SESSION;
      if (!session) throw new HttpError(401, "Sign in to use Intent UI");
      const hostTools = typeof options.tools === "function" ? await options.tools(request, bindings, session) : (options.tools ?? []);
      const env: Env = { ...bindings, user: session.userId, hostTools, basePath, demoData: options.demoData ?? false };
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
  };
}
