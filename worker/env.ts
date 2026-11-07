import type { ConnectionsStore } from "./store/ConnectionsStore";
import type { WorkspaceDirectory } from "./store/WorkspaceDirectory";
import type { WorkspaceStore } from "./store/WorkspaceStore";

/** Worker bindings and secrets. Local values come from `.dev.vars`. */
export interface Env {
  ANTHROPIC_API_KEY?: string;
  /** Defaults to `claude-opus-5-5`. */
  ANTHROPIC_MODEL?: string;
  /** One Durable Object per workspace (ADR 0008). */
  WORKSPACES: DurableObjectNamespace<WorkspaceStore>;
  /** Singleton listing workspaces. */
  DIRECTORY: DurableObjectNamespace<WorkspaceDirectory>;
  /** The user's data connections (ADR 0014): one instance per user ("local" until identity lands). */
  CONNECTIONS: DurableObjectNamespace<ConnectionsStore>;
}
