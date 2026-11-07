import type {
  ActivityEntry,
  ConnectionSummary,
  CreateConnectionRequest,
  CreateConnectionResponse,
  ToolPolicyRequest,
} from "../../../shared/api";
import { api } from "../../lib/api";

const base = (id: string) => `/api/connections/${encodeURIComponent(id)}`;

export const listConnections = () => api<ConnectionSummary[]>("GET", "/api/connections");
export const addConnection = (request: CreateConnectionRequest) => api<CreateConnectionResponse>("POST", "/api/connections", request);
export const reauthorize = (id: string) => api<{ authUrl: string }>("POST", `${base(id)}/authorize`);
export const refreshConnection = (id: string) => api<ConnectionSummary>("POST", `${base(id)}/refresh`);
export const setToolPolicy = (id: string, tool: string, policy: ToolPolicyRequest) =>
  api<ConnectionSummary>("PUT", `${base(id)}/tools/${encodeURIComponent(tool)}`, policy);
export const connectionActivity = (id: string) => api<ActivityEntry[]>("GET", `${base(id)}/activity`);
export const removeConnection = (id: string) => api<void>("DELETE", base(id));
