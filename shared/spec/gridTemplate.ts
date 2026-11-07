import { z } from "zod";

/**
 * Custom CSS grid templates for layouts (RFC 0002 §4.4). Tailwind can't compile arbitrary
 * values that arrive at runtime, so templates are passed as CSS variables and applied by
 * fixed, pre-compiled classes like `md:grid-cols-(--cols-md)`.
 */

const ALLOWED_WORDS = new Set([
  "fr", "px", "rem", "em", "minmax", "repeat", "auto",
  "min-content", "max-content", "fit-content", "auto-fill", "auto-fit",
]);
const MAX_LENGTH = 160;

/** True if a value is a safe grid-template track list, e.g. `minmax(0, 2fr) 18rem`. */
export function isValidGridTemplate(value: string): boolean {
  if (value.length === 0 || value.length > MAX_LENGTH) return false;
  if (!/^[0-9a-z.%(),\s-]+$/.test(value)) return false;
  const words = value.match(/[a-z]+(-[a-z]+)*/g) ?? [];
  return words.every((word) => ALLOWED_WORDS.has(word));
}

const TrackListSchema = z.string().refine(isValidGridTemplate, "Invalid grid template");

export const BREAKPOINTS = ["base", "sm", "md", "lg", "xl"] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];

const ResponsiveTrackListSchema = z
  .object({
    base: TrackListSchema.optional(),
    sm: TrackListSchema.optional(),
    md: TrackListSchema.optional(),
    lg: TrackListSchema.optional(),
    xl: TrackListSchema.optional(),
  })
  .strict();

export const GridTemplateSchema = z
  .object({ columns: ResponsiveTrackListSchema.optional(), rows: ResponsiveTrackListSchema.optional() })
  .strict();
export type GridTemplate = z.infer<typeof GridTemplateSchema>;
