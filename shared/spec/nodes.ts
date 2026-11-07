import { z } from "zod";
import { GridTemplateSchema } from "./gridTemplate";
import { ClassNameSchema, HtmlNodeSchema, type HtmlNode } from "./html";
import { VisibilityConditionSchema } from "./visibility";

/*
 * Two kinds of tree (RFC 0002 §3, ADR 0005):
 * - Layout trees: structured HTML + slots. Static content only, no data, no components.
 * - Block trees: catalog components, plus structured HTML for custom UI the catalog lacks,
 *   both bound to the block's view model.
 */

export const SlotNodeSchema = z.object({
  kind: z.literal("slot"),
  className: ClassNameSchema.optional(),
  grid: GridTemplateSchema.optional(),
});

export const LayoutNodeSchema = z.discriminatedUnion("kind", [HtmlNodeSchema, SlotNodeSchema]);

/** An action fired by a component (RFC 0001 §8.4). */
export const ActionSchema = z.object({
  /** `set` writes UI state: params { path: "/ui/...", value }. `research` re-researches a web source: params { source }. */
  name: z.enum(["intent", "tool", "set", "close", "refresh", "navigate", "research"]),
  /** Each param is a JSON value; `{ path }` bindings inside are resolved when the action fires. */
  params: z.record(z.string(), z.unknown()).optional(),
});
export type Action = z.infer<typeof ActionSchema>;

export const ComponentNodeSchema = z.object({
  type: z.string().min(1),
  props: z.record(z.string(), z.unknown()).default({}),
  children: z.array(z.string()).optional(),
  action: ActionSchema.optional(),
  /** Hide the node unless this holds (e.g. column toggles bound to `/ui/...` state). */
  visible: VisibilityConditionSchema.optional(),
});

export type SlotNode = z.infer<typeof SlotNodeSchema>;
export type LayoutNode = z.infer<typeof LayoutNodeSchema>;
export type ComponentNode = z.infer<typeof ComponentNodeSchema>;

/** A node in a block tree: a catalog component, or structured HTML. */
export const BlockNodeSchema = z.union([HtmlNodeSchema, ComponentNodeSchema]);
export type BlockNode = HtmlNode | ComponentNode;

export function isHtmlNode(node: BlockNode | undefined): node is HtmlNode {
  return node !== undefined && "kind" in node && node.kind === "html";
}

export type { HtmlNode };

/** A page layout: flat map of HTML and slot nodes, plus the root id. */
export const LayoutTreeSchema = z.object({
  root: z.string(),
  nodes: z.record(z.string(), LayoutNodeSchema),
});
export type LayoutTree = z.infer<typeof LayoutTreeSchema>;

/**
 * A block's UI: flat map of component nodes, the body root id, and an optional toolbar root
 * rendered in the block's header next to its data-source badges (extends Kumo's `UITree`).
 */
export const BlockTreeSchema = z.object({
  root: z.string(),
  toolbar: z.string().optional(),
  nodes: z.record(z.string(), BlockNodeSchema),
});
export type BlockTree = z.infer<typeof BlockTreeSchema>;
