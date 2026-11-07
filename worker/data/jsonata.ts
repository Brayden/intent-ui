import jsonata from "jsonata";

const TIME_BUDGET_MS = 1000;
const compiled = new Map<string, ReturnType<typeof jsonata>>();

/** A JSONata failure with a message the model (or user) can act on. */
export class ExpressionError extends Error {}

const formatMillis = jsonata("$fromMillis($ms, $picture, $timezone)");

/**
 * The deterministic clock and the functions it replaces (RFC 0003 §5.6): `$now()` and `$millis()`
 * return the evaluation's `asOf` time, fixed once per page load, so the same inputs always give
 * the same output. `$random()` has no deterministic meaning and always fails.
 */
function clockBindings(asOf: number): Record<string, unknown> {
  return {
    millis: () => asOf,
    now: async (picture?: string, timezone?: string) =>
      picture === undefined && timezone === undefined ? new Date(asOf).toISOString() : formatMillis.evaluate({}, { ms: asOf, picture, timezone }),
    random: () => {
      throw new ExpressionError("$random() isn't allowed: views and sources must be deterministic");
    },
  };
}


/** Per-evaluation options. `asOf` (epoch ms) is what `$now()`/`$millis()` return; defaults to now. */
export type EvaluateOptions = { asOf?: number };

/**
 * Evaluates a JSONata expression with only the given bindings visible (RFC 0002 §5.2) and a
 * time budget (§5.6 rule 7). Compiled expressions are cached.
 */
export async function evaluate(
  expr: string,
  input: unknown,
  bindings: Record<string, unknown> = {},
  options: EvaluateOptions = {},
): Promise<unknown> {
  let expression = compiled.get(expr);
  if (!expression) {
    try {
      expression = jsonata(expr);
    } catch (error) {
      throw new ExpressionError(`Invalid JSONata "${expr.slice(0, 80)}": ${(error as Error).message}`);
    }
    compiled.set(expr, expression);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ExpressionError(`JSONata took longer than ${TIME_BUDGET_MS}ms`)), TIME_BUDGET_MS);
  });
  try {
    return await Promise.race([expression.evaluate(input, { ...bindings, ...clockBindings(options.asOf ?? Date.now()) }), timeout]);
  } catch (error) {
    if (error instanceof ExpressionError) throw error;
    throw new ExpressionError(`JSONata error in "${expr.slice(0, 80)}": ${(error as Error).message}`);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** JSONata unwraps one-element sequences; collections must stay arrays. */
export function asCollection(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
