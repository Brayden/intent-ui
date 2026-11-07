type Limits = { maxItems: number; maxString: number; maxChars: number };

/** Default: a glimpse of a tool's output shape. */
export const SHAPE_SAMPLE: Limits = { maxItems: 3, maxString: 200, maxChars: 6000 };
/** For web pages: enough items and text to read and extract from. */
export const READING_SAMPLE: Limits = { maxItems: 25, maxString: 12_000, maxChars: 20_000 };

/** Shrinks a tool result for the model: first few array items, long strings cut. */
export function sampleForModel(value: unknown, limits: Limits = SHAPE_SAMPLE, depth = 0): unknown {
  if (depth > 6) return "…";
  if (Array.isArray(value)) {
    const items = value.slice(0, limits.maxItems).map((entry) => sampleForModel(entry, limits, depth + 1));
    return value.length > limits.maxItems ? [...items, `… ${value.length - limits.maxItems} more items`] : items;
  }
  if (typeof value === "string") return value.length > limits.maxString ? `${value.slice(0, limits.maxString)}…` : value;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sampleForModel(entry, limits, depth + 1)]));
  }
  return value;
}

/** JSON for a tool_result, truncated to a safe size. */
export function sampleJson(value: unknown, limits: Limits = SHAPE_SAMPLE): string {
  const json = JSON.stringify(sampleForModel(value, limits), null, 1);
  return json.length > limits.maxChars ? `${json.slice(0, limits.maxChars)}\n… (truncated)` : json;
}
