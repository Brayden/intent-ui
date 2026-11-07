import { z } from "zod";

/**
 * A JSON Pointer into the view model. Paths starting with `$item` resolve against the
 * current repeated item (a table row, a list entry); all others resolve from the root.
 */
export const PathRefSchema = z.object({ path: z.string().min(1) });
export type PathRef = z.infer<typeof PathRefSchema>;

/** Type guard for `{ path: string }` objects (no other checks). */
export function isPathRefLike(value: unknown): value is PathRef {
  return typeof value === "object" && value !== null && "path" in value && typeof value.path === "string";
}

/** A literal value or a reference into the view model (Kumo's `DynamicValue` convention). */
export const DynamicValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  PathRefSchema,
]);
export type DynamicValue = z.infer<typeof DynamicValueSchema>;

/** A JSONata expression, evaluated over declared inputs only. */
export const ExprSchema = z.object({ expr: z.string().min(1) });
export type Expr = z.infer<typeof ExprSchema>;

/** Minimal JSON Schema placeholder; tightened when schema inference lands. */
export const JsonSchemaSchema = z.record(z.string(), z.unknown());
export type JsonSchema = z.infer<typeof JsonSchemaSchema>;
