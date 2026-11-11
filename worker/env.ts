import type { Connection } from "./connections/types";
import type { ConnectionsStore } from "./store/ConnectionsStore";
import type { WorkspaceDirectory } from "./store/WorkspaceDirectory";
import type { WorkspaceStore } from "./store/WorkspaceStore";

/**
 * Cloudflare bindings and secrets Intent UI needs (local values come from `.dev.vars`). A host
 * adds these to its own Worker: the three Durable Object classes plus the API key.
 */
export interface Bindings {
  ANTHROPIC_API_KEY?: string;
  /** Defaults to `claude-opus-5-5`. */
  ANTHROPIC_MODEL?: string;
  /** One Durable Object per workspace (ADR 0008). */
  WORKSPACES: DurableObjectNamespace<WorkspaceStore>;
  /** One per user: the workspaces they own. */
  DIRECTORY: DurableObjectNamespace<WorkspaceDirectory>;
  /** One per user: their data connections (ADR 0014). */
  CONNECTIONS: DurableObjectNamespace<ConnectionsStore>;
}

/** What every route sees: the bindings plus this request's context from the server handler. */
export interface Env extends Bindings {
  /** Who's asking (from the host's session); scopes workspaces, connections and customizations. */
  user: string;
  /** Tools the host provides from its own API, alongside the user's connections. */
  hostTools: Connection[];
  /** Where the handler is mounted, e.g. "/api" or "/intent-ui/api". */
  basePath: string;
  /** Include the demo HR data source (the standalone app's example; off for hosts). */
  demoData: boolean;
}
