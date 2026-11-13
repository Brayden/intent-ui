import type {
  ComposeRequest,
  ComposeResponse,
  DraftStreamEvent,
  StreamEnd,
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
import { api, apiStream, ApiRequestError } from "../../lib/api";

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

/** Reads a stream that ends with `result` (resolved) or `error` (thrown); other events go to `onEvent`. */
async function streamResult<R>(path: string, request: unknown, onEvent: (event: DraftStreamEvent) => void, signal?: AbortSignal): Promise<R> {
  let result: R | undefined;
  let failure: ApiRequestError | undefined;
  await apiStream<DraftStreamEvent | StreamEnd<R>>(
    path,
    request,
    (event) => {
      if (event.type === "result") result = event.result;
      else if (event.type === "error") {
        const message = event.details?.length ? `${event.error}: ${event.details.join("; ")}` : event.error;
        failure = new ApiRequestError(message, 502, event);
      } else onEvent(event);
    },
    signal,
  );
  if (failure) throw failure;
  if (result === undefined) throw new ApiRequestError("The connection closed before it was finished", 502, null);
  return result;
}

/**
 * Compose with progressive rendering (ADR 0017): `onEvent` sees draft events as the model writes;
 * resolves with the validated result, the same as `composePage`.
 */
export const composePageStream = (id: string, request: ComposeRequest, onEvent: (event: DraftStreamEvent) => void, signal?: AbortSignal) =>
  streamResult<ComposeResponse>(`${base(id)}/compose`, request, onEvent, signal);

/**
 * Generates an intent's page as a stream (ADR 0011, 0017): the first event names the page, so it
 * can be opened right away; resolves with the same result as `generatePage`.
 */
export const generatePageStream = (id: string, request: GeneratePageRequest, onEvent: (event: DraftStreamEvent) => void, signal?: AbortSignal) =>
  streamResult<GeneratePageResponse>(`${base(id)}/pages`, request, onEvent, signal);
