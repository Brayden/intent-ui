import { z } from "zod";
import type { CatalogSpec } from "./types";

/* Layout and input primitives for arranging and controlling UI inside blocks. */

export const StackPropsSchema = z.object({
  direction: z.enum(["row", "column"]).default("column"),
  gap: z.enum(["none", "sm", "base", "lg"]).default("base"),
  align: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
  justify: z.enum(["start", "center", "end", "between"]).default("start"),
  wrap: z.boolean().default(false),
});
export type StackProps = z.infer<typeof StackPropsSchema>;

export const CheckboxPropsSchema = z.object({
  label: z.string(),
  /** UI state path this checkbox reads and writes, e.g. "/ui/hidden/col-prs". */
  bind: z.string().regex(/^\/ui\//, "bind must be a /ui/... path"),
  /** Checked when the bound value is NOT set (e.g. a "show" checkbox bound to a "hidden" flag). */
  invert: z.boolean().default(false),
  /**
   * List membership: when set, `bind` holds a list and the checkbox adds/removes this value
   * (e.g. `{ "path": "$item/id" }` for per-item checkboxes in a list).
   */
  value: z.unknown().optional(),
});
export type CheckboxProps = z.infer<typeof CheckboxPropsSchema>;

export const PopoverPropsSchema = z.object({
  /** Trigger button label, e.g. "Columns". */
  label: z.string(),
  variant: z.enum(["secondary", "ghost", "outline"]).default("secondary"),
  title: z.string().optional(),
});
export type PopoverProps = z.infer<typeof PopoverPropsSchema>;

export const stackSpec: CatalogSpec = {
  type: "Stack",
  description:
    "Arranges children in a row or column. Use it to group controls, or as a new root to place something above/below/beside existing content.",
  props: StackPropsSchema,
  children: "any",
};

export const checkboxSpec: CatalogSpec = {
  type: "Checkbox",
  description:
    "A checkbox bound two-way to UI state at `bind` (/ui/...). Pair with `visible` conditions on other nodes to show/hide them. Use `invert` for 'show X' checkboxes bound to a 'hidden' flag. With `value`, it toggles that value's membership in a list at `bind` (per-item checkboxes).",
  props: CheckboxPropsSchema,
};

export const popoverSpec: CatalogSpec = {
  type: "Popover",
  description:
    "A button that opens a small panel with its children (e.g. a 'Columns' menu of checkboxes, or filters). Good in a block toolbar.",
  props: PopoverPropsSchema,
  children: "any",
};

export const TextInputPropsSchema = z.object({
  /** Visible label; omit for a bare input (then `placeholder` is its accessible name). */
  label: z.string().optional(),
  placeholder: z.string().optional(),
  /**
   * Where the text lives: "/ui/..." (UI state, saved as you type) or "/route/<param>" (the page
   * URL, e.g. "/route/q" → ?q=…, which sources read as $route.q; written on Enter, or as you type
   * with `live`). Use /route/ when the text should change what data is loaded (search, lookups).
   */
  bind: z.string().regex(/^\/(ui|route)\//, "bind must be a /ui/... or /route/... path"),
  /** For /route/ binds: update the URL (and reload data) as the user types, after a short pause. */
  live: z.boolean().default(false),
  type: z.enum(["text", "search", "email", "number", "url"]).default("text"),
});
export type TextInputProps = z.infer<typeof TextInputPropsSchema>;

export const textInputSpec: CatalogSpec = {
  type: "TextInput",
  description:
    "A text field bound two-way to `bind`. For search or anything that should load different data, bind it to a page route param (\"/route/q\") and have sources read $route.q (see \"Interactive data\"); pair it with a Button whose action sets the same path from the field, or rely on Enter. For local state (a note, a draft), bind to /ui/....",
  props: TextInputPropsSchema,
  action: "fired when Enter is pressed, after the value is saved (e.g. a `set`, `navigate`, or `tool`); `$item` as in its list, if any.",
};
