import type { z } from "zod";

type Issue = z.core.$ZodIssue;

/**
 * Flattens zod issues into readable lines. For a failed union (e.g. a node that's neither valid
 * HTML nor a valid component), reports the issues of the closest branch instead of
 * "Invalid input", so the model knows what to fix.
 */
export function describeIssues(issues: readonly Issue[], prefix: PropertyKey[] = []): string[] {
  return issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    if (issue.code === "invalid_union" && issue.errors.length > 0) {
      const closest = [...issue.errors].sort((a, b) => a.length - b.length)[0] ?? [];
      return describeIssues(closest, path);
    }
    return [`${path.map(String).join(".")}: ${issue.message}`];
  });
}
