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

/** JSON request to the Worker's /api. Throws `ApiRequestError` with the server's message. */
export async function api<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
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
