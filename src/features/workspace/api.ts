import type {
  ComposeRequest,
  ComposeResponse,
  CreateWorkspaceRequest,
  GeneratePageRequest,
  GeneratePageResponse,
  PutTemplateResponse,
  ResearchRefreshRequest,
  ResearchRefreshResponse,
  RefreshResponse,
  SaveWorkspaceRequest,
  SaveWorkspaceResponse,
  Template,
  WorkspaceResponse,
  WorkspaceSummary,
} from "../../../shared/api";
import { api } from "../../lib/api";

const base = (id: string) => `/api/workspaces/${encodeURIComponent(id)}`;

export const listWorkspaces = () => api<WorkspaceSummary[]>("GET", "/api/workspaces");
export const createWorkspace = (request: CreateWorkspaceRequest) => api<{ id: string }>("POST", "/api/workspaces", request);
export const getWorkspace = (id: string) => api<WorkspaceResponse>("GET", base(id));
export const deleteWorkspace = (id: string) => api<void>("DELETE", base(id));
export const saveWorkspace = (id: string, request: SaveWorkspaceRequest) => api<SaveWorkspaceResponse>("PUT", base(id), request);
export const refreshData = (id: string, pageId: string, route: Record<string, string> = {}, blocks?: string[]) =>
  api<RefreshResponse>("POST", `${base(id)}/data`, { pageId, route, blocks });
export const generatePage = (id: string, request: GeneratePageRequest) => api<GeneratePageResponse>("POST", `${base(id)}/pages`, request);
export const putTemplate = (id: string, template: Template, aliasKey?: string) =>
  api<PutTemplateResponse>("POST", `${base(id)}/templates`, { template, aliasKey });
export const refreshResearch = (id: string, sourceId: string, request: ResearchRefreshRequest) =>
  api<ResearchRefreshResponse>("POST", `${base(id)}/sources/${encodeURIComponent(sourceId)}/research`, request);
export const composePage = (id: string, request: ComposeRequest) => api<ComposeResponse>("POST", `${base(id)}/compose`, request);
