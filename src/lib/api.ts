import type { ApiError } from "../../shared/api";

/** An API failure: the server's message (plus details), and the status and body for callers that care. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

let apiBase = "/api";

/**
 * Where the Intent UI server handler is mounted. The app uses "/api"; a host embedding the SDK may
 * mount it elsewhere (e.g. "/intent-ui/api"). Callers keep writing "/api/..." paths.
 */
export function setApiBase(base: string): void {
  apiBase = base.replace(/\/+$/, "");
}

/** Resolves an "/api/..." path against the configured base. */
export function apiUrl(path: string): string {
  return path.startsWith("/api") ? apiBase + path.slice("/api".length) : path;
}

/** JSON request to the Worker's /api. Throws `ApiRequestError` with the server's message. */
export async function api<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const json: unknown = await response.json().catch(() => ({ error: response.statusText }));
  if (response.ok) return json as T;
  const error = json as ApiError;
  const message = error.details?.length ? `${error.error}: ${error.details.join("; ")}` : error.error;
  throw new ApiRequestError(message, response.status, json);
}

/**
 * POSTs to an endpoint that answers with server-sent events and calls `onEvent` with each
 * event's JSON `data`. Resolves when the stream ends. Throws `ApiRequestError` if the request
 * fails before streaming starts (e.g. validation), like `api`.
 */
export async function apiStream<E>(path: string, body: unknown, onEvent: (event: E) => void, signal?: AbortSignal): Promise<void> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const json: unknown = await response.json().catch(() => ({ error: response.statusText }));
    const error = json as ApiError;
    const message = error.details?.length ? `${error.error}: ${error.details.join("; ")}` : error.error;
    throw new ApiRequestError(message, response.status, json);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as E);
    }
    if (done) return;
  }
}
