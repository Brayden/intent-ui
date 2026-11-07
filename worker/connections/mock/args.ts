import type { z } from "zod";
import { HttpError } from "../../lib/http";

/** Parses mock tool args, turning schema errors into a 400 the model can read. */
export function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const parsed = schema.safeParse(args);
  if (!parsed.success) throw new HttpError(400, "Invalid tool arguments", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  return parsed.data;
}
