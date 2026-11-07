/** How a value is displayed. Shared by catalog schemas and the renderer's formatter. */
/** `count` shows a list's length (e.g. how many rows are selected). */
export const VALUE_FORMATS = ["text", "number", "compact", "date", "relative", "count"] as const;
export type ValueFormat = (typeof VALUE_FORMATS)[number];
