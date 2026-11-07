import type { ValueFormat } from "../../../../shared/catalog";

/** Placeholder for unknown values. Unknown is never rendered as zero (RFC 0002 §5.6). */
export const UNKNOWN = "—";

const compact = new Intl.NumberFormat(undefined, { notation: "compact" });
const plain = new Intl.NumberFormat();
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function formatRelative(date: Date): string {
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

/**
 * Formats a view-model value for display.
 * @param complete false when the value came from a truncated source; numbers become "N+".
 */
export function formatValue(value: unknown, format: ValueFormat = "text", complete = true): string {
  if (format === "count") return plain.format(Array.isArray(value) ? value.length : 0);
  if (value === null || value === undefined || value === "") return UNKNOWN;
  if (typeof value === "number") {
    const text = format === "compact" ? compact.format(value) : plain.format(value);
    return complete ? text : `${text}+`;
  }
  if (format === "date" || format === "relative") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return format === "date" ? date.toLocaleDateString() : formatRelative(date);
  }
  return String(value);
}
