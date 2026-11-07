const MAX_ITEMS = 2;
const MAX_DEPTH = 4;

/**
 * A small sample of a view model: arrays cut to their first items, deep nesting dropped.
 * Enough for the model to see which fields exist without sending the whole dataset.
 */
export function dataSample(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return "…";
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((entry) => dataSample(entry, depth + 1));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, dataSample(entry, depth + 1)]));
  }
  return value;
}
