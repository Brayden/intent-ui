import { z } from "zod";
import { VALUE_FORMATS } from "./formats";
import type { CatalogSpec } from "./types";

export const DataTablePropsSchema = z.object({
  /** Resolved array of row objects (bind with `{ "path": "/rows" }`). Null while loading. */
  rows: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  /** Field holding each row's stable item key (ADR 0001 §4). */
  rowKey: z.string(),
  emptyTitle: z.string().default("Nothing here yet"),
  emptyDescription: z.string().optional(),
  /** Input aliases the rows come from; drives the table-level loading/error state. */
  requires: z.array(z.string()).default([]),
  /**
   * Row selection: a /ui/... path holding the selected rows' keys (`rowKey` values) as a list.
   * Adds a checkbox column with select-all. Read the same path elsewhere to act on the selection.
   */
  selectionBind: z.string().regex(/^\/ui\//, "selectionBind must be a /ui/... path").optional(),
});
export type DataTableProps = z.infer<typeof DataTablePropsSchema>;

export const DataColumnPropsSchema = z.object({
  header: z.string().default(""),
  /** Field on the row to display. Omit and add child nodes to render a custom cell. */
  field: z.string().optional(),
  /** Optional second line under the value, e.g. job title under a name. */
  subField: z.string().optional(),
  format: z.enum(VALUE_FORMATS).default("text"),
  /** Field on the row holding a URL; when set, the value renders as an external link. */
  linkField: z.string().optional(),
  align: z.enum(["left", "right"]).default("left"),
  /** Input aliases this column depends on (per-cell loading/error, RFC 0002 §5.6). */
  requires: z.array(z.string()).default([]),
});
export type DataColumnProps = z.infer<typeof DataColumnPropsSchema>;

export const dataTableSpec: CatalogSpec = {
  type: "DataTable",
  description:
    "Table over an array in the view model. Children must be DataColumn nodes. Bind `rows` with a path and set `rowKey` to the item key. For selectable rows set `selectionBind` (e.g. \"/ui/selected\"); the selected keys are then available at that path (count them with Text format `count`, show bulk actions with `visible: { path }`, pass them to tool args).",
  props: DataTablePropsSchema,
  action:
    "fired when a row is clicked (or focused and Enter pressed): the whole row is the click target, with `$item` = that row. Use it for clickable rows, e.g. { \"name\": \"intent\", \"params\": { \"id\": \"track-details\", \"prompt\": \"Show this track's details\" } }. Buttons, links, menus and checkboxes inside the row keep their own clicks.",
  children: { only: "DataColumn" },
};

export const dataColumnSpec: CatalogSpec = {
  type: "DataColumn",
  description:
    "A DataTable column. Show `field` (optionally with a `subField` second line) with a `format`, or add child nodes as a cell template using `$item/...` paths.",
  props: DataColumnPropsSchema,
  parent: "DataTable",
  children: "any",
};
