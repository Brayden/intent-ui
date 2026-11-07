import { z } from "zod";
import { DynamicValueSchema, PathRefSchema, type DynamicValue } from "./values";

/**
 * When a component shows (Kumo's VisibilityCondition, trimmed). A `{ path }` is truthy-tested;
 * unset UI state is undefined, so name flags so that "unset" is the default you want
 * (e.g. `/ui/hidden/col-prs`, shown with `{ "not": { "path": ... } }`).
 */
export type VisibilityCondition =
  | boolean
  | { path: string }
  | { not: VisibilityCondition }
  | { and: VisibilityCondition[] }
  | { or: VisibilityCondition[] }
  | { eq: [DynamicValue, DynamicValue] };

export const VisibilityConditionSchema: z.ZodType<VisibilityCondition> = z.lazy(() =>
  z.union([
    z.boolean(),
    PathRefSchema,
    z.object({ not: VisibilityConditionSchema }),
    z.object({ and: z.array(VisibilityConditionSchema) }),
    z.object({ or: z.array(VisibilityConditionSchema) }),
    z.object({ eq: z.tuple([DynamicValueSchema, DynamicValueSchema]) }),
  ]),
);

/** Truthiness for conditions: like JS, except empty lists and empty strings are false. */
export function isTruthy(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

/** Evaluates a condition; `read` resolves `{ path }` values. Missing condition = visible. */
export function isVisible(condition: VisibilityCondition | undefined, read: (path: string) => unknown): boolean {
  if (condition === undefined) return true;
  if (typeof condition === "boolean") return condition;
  if ("path" in condition) return isTruthy(read(condition.path));
  if ("not" in condition) return !isVisible(condition.not, read);
  if ("and" in condition) return condition.and.every((c) => isVisible(c, read));
  if ("or" in condition) return condition.or.some((c) => isVisible(c, read));
  const value = (v: DynamicValue) => (typeof v === "object" && v !== null ? read(v.path) : v);
  return value(condition.eq[0]) === value(condition.eq[1]);
}

/** State a dismiss can clear: UI state or the page URL (ADR 0013). */
const isWritable = (path: string) => path.startsWith("/ui/") || path.startsWith("/route/");

/**
 * The state paths to clear (set to null) so `condition` becomes false: how a Dialog's X/Esc closes
 * whatever opened it. Null when the condition can't be made false that way (e.g. `not`, or it
 * reads data/`$item`); then the dialog hides itself instead.
 */
export function closingWrites(condition: VisibilityCondition | undefined, read: (path: string) => unknown): string[] | null {
  if (condition === undefined || typeof condition === "boolean") return null;
  if ("path" in condition) return isWritable(condition.path) ? [condition.path] : null;
  if ("not" in condition) return null;
  if ("and" in condition) {
    for (const child of condition.and) {
      const writes = closingWrites(child, read);
      if (writes) return writes;
    }
    return null;
  }
  if ("or" in condition) {
    const writes: string[] = [];
    for (const child of condition.or) {
      if (!isVisible(child, read)) continue;
      const childWrites = closingWrites(child, read);
      if (!childWrites) return null;
      writes.push(...childWrites);
    }
    return writes.length > 0 ? writes : null;
  }
  const [a, b] = condition.eq;
  const writable = [a, b].find((v): v is { path: string } => typeof v === "object" && v !== null && isWritable(v.path));
  return writable ? [writable.path] : null;
}

/** Every `{ path }` a condition reads. */
export function conditionPaths(condition: VisibilityCondition | undefined): string[] {
  if (condition === undefined || typeof condition === "boolean") return [];
  if ("path" in condition) return [condition.path];
  if ("not" in condition) return conditionPaths(condition.not);
  if ("and" in condition) return condition.and.flatMap(conditionPaths);
  if ("or" in condition) return condition.or.flatMap(conditionPaths);
  return condition.eq.flatMap((v) => (typeof v === "object" && v !== null ? [v.path] : []));
}
