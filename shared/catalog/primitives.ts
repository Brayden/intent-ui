import { z } from "zod";
import { VALUE_FORMATS } from "./formats";
import type { CatalogSpec } from "./types";

/* Kumo primitives exposed with data-friendly props. */

export const TextPropsSchema = z.object({
  text: z.unknown().optional(),
  /** How to display `text`, e.g. "count" for the length of a list ("3"). */
  format: z.enum(VALUE_FORMATS).default("text"),
  /** Static text around the value, e.g. suffix " selected" → "3 selected". */
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  variant: z.enum(["body", "secondary", "success", "error", "mono"]).default("body"),
  size: z.enum(["xs", "sm", "base", "lg"]).default("base"),
});
export type TextProps = z.infer<typeof TextPropsSchema>;

export const BadgePropsSchema = z.object({
  text: z.unknown().optional(),
  variant: z.enum(["neutral", "success", "warning", "error", "info", "outline"]).default("neutral"),
});
export type BadgeProps = z.infer<typeof BadgePropsSchema>;

export const ButtonPropsSchema = z.object({
  label: z.string(),
  variant: z.enum(["primary", "secondary", "ghost", "outline"]).default("secondary"),
  size: z.enum(["sm", "base"]).default("base"),
});
export type ButtonProps = z.infer<typeof ButtonPropsSchema>;

export const textSpec: CatalogSpec = {
  type: "Text",
  description:
    "Themed text. Bind `text` with a path for data, with an optional `format` (e.g. `count` for a list's length) and `prefix`/`suffix`. `variant`: body, secondary, success, error, mono.",
  props: TextPropsSchema,
};

export const badgeSpec: CatalogSpec = {
  type: "Badge",
  description: "Small status label. `variant`: neutral, success, warning, error, info, outline.",
  props: BadgePropsSchema,
};

export const buttonSpec: CatalogSpec = {
  type: "Button",
  description:
    "A button that fires the node's `action` (e.g. `refresh`, `close`, `intent`). `variant`: primary, secondary, ghost, outline.",
  action: "fired on click.",
  props: ButtonPropsSchema,
};
