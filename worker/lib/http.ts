import type { z } from "zod";
import type { ApiError } from "../../shared/api";

/** An error with an HTTP status and a message that's safe to show the user. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
  }
}

/** Parses and validates a JSON request body, or throws a 400. */
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await request.json().catch(() => {
    throw new HttpError(400, "Request body must be JSON");
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  return parsed.data;
}

/** Converts any thrown value into the shared `{ error }` response shape. */
export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    const body: ApiError = { error: error.message, details: error.details };
    return Response.json(body, { status: error.status });
  }
  console.error(error);
  const body: ApiError = { error: "Unexpected server error" };
  return Response.json(body, { status: 500 });
}
