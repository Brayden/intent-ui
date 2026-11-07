import { z } from "zod";
import { BlockTreeSchema, LayoutNodeSchema, LayoutTreeSchema, type LayoutTree } from "./nodes";
import { BlockFramePatchSchema, BlockFrameSchema } from "./frame";
import { hasBindings } from "./html";
import type { Block } from "./workspace";

/*
 * Page-level edits that can accompany a pointed edit (ADR 0004 addendum): change the layout
 * around a block, move blocks between slots, and add blocks next to the one being edited.
 */

export const LayoutOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("upsert"), id: z.string().min(1), node: LayoutNodeSchema }),
  z.object({ op: z.literal("remove"), id: z.string().min(1) }),
  z.object({ op: z.literal("setRoot"), id: z.string().min(1) }),
]);
export type LayoutOp = z.infer<typeof LayoutOpSchema>;

export const PlacementSchema = z.object({ blockId: z.string(), slot: z.string(), order: z.number() });

/** A new block. It reads the same data (inputs + view) as the block being edited. */
export const NewBlockSchema = BlockTreeSchema.extend({
  id: z.string().min(1),
  slot: z.string(),
  order: z.number(),
  title: z.string().optional(),
  frame: BlockFrameSchema.default({ style: "card", title: true, sources: true, freshness: true }),
});

/** Changes to an existing block's chrome or title (any block on the page). */
export const BlockPatchSchema = z.object({
  blockId: z.string(),
  title: z.string().nullable().optional(),
  frame: BlockFramePatchSchema.optional(),
});
export type BlockPatch = z.infer<typeof BlockPatchSchema>;
export type NewBlock = z.infer<typeof NewBlockSchema>;

export const PageChangesSchema = z.object({
  layoutOps: z.array(LayoutOpSchema).default([]),
  placements: z.array(PlacementSchema).default([]),
  newBlocks: z.array(NewBlockSchema).default([]),
  blockPatches: z.array(BlockPatchSchema).default([]),
  removeBlocks: z.array(z.string()).default([]),
});

/** True if the changes do anything. */
export function hasPageChanges(changes: PageChanges): boolean {
  return Object.values(changes).some((list) => list.length > 0);
}
export type PageChanges = z.infer<typeof PageChangesSchema>;

/** Applies layout ops; `remove` drops the node's subtree and its references. Pure. */
export function applyLayoutOps(layout: LayoutTree, ops: LayoutOp[]): LayoutTree {
  const nodes = { ...layout.nodes };
  let root = layout.root;
  const subtree = (id: string, into = new Set<string>([id])): Set<string> => {
    const node = nodes[id];
    for (const child of node?.kind === "html" ? (node.children ?? []) : []) {
      if (!into.has(child)) subtree(child, into.add(child));
    }
    return into;
  };
  for (const op of ops) {
    if (op.op === "upsert") nodes[op.id] = op.node;
    else if (op.op === "setRoot") root = op.id;
    else {
      for (const id of subtree(op.id)) delete nodes[id];
      for (const [id, node] of Object.entries(nodes)) {
        if (node.kind === "html" && node.children?.includes(op.id)) {
          nodes[id] = { ...node, children: node.children.filter((child) => child !== op.id) };
        }
      }
    }
  }
  return { root, nodes };
}

/** Structural checks for a layout (classes and grids are checked by the schema). */
export function validateLayoutTree(layout: LayoutTree): string[] {
  const parsed = LayoutTreeSchema.safeParse(layout);
  if (!parsed.success) return parsed.error.issues.map((i) => `layout.${i.path.join(".")}: ${i.message}`);
  const issues: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (path.includes(id)) return void issues.push(`layout cycle at "${id}"`);
    const node = layout.nodes[id];
    if (!node) return void issues.push(`layout node "${path.at(-1) ?? "root"}" references missing "${id}"`);
    seen.add(id);
    if (node.kind === "html" && hasBindings(node)) issues.push(`layout node "${id}": layouts are static; data bindings belong in blocks`);
    if (node.kind === "html") for (const child of node.children ?? []) visit(child, [...path, id]);
  };
  visit(layout.root, []);
  for (const id of Object.keys(layout.nodes)) if (!seen.has(id)) issues.push(`layout node "${id}" is unreachable`);
  return issues;
}

type PageBlock = Pick<Block, "id" | "slot" | "order">;

/**
 * Applies page changes to a layout and its blocks' placements, and checks the result:
 * valid layout, every block (existing and new) in a slot that exists, no id collisions.
 */
export function applyPageChanges(layout: LayoutTree, blocks: PageBlock[], changes: PageChanges) {
  const nextLayout = applyLayoutOps(layout, changes.layoutOps);
  const placed = blocks.map((block) => {
    const move = changes.placements.find((p) => p.blockId === block.id);
    return move ? { ...block, slot: move.slot, order: move.order } : block;
  });
  const issues = validateLayoutTree(nextLayout);
  const exists = (id: string) => blocks.some((b) => b.id === id);
  for (const move of changes.placements) if (!exists(move.blockId)) issues.push(`placement: no block "${move.blockId}" on this page`);
  for (const patch of changes.blockPatches) if (!exists(patch.blockId)) issues.push(`blockPatches: no block "${patch.blockId}" on this page`);
  for (const id of changes.removeBlocks) if (!exists(id)) issues.push(`removeBlocks: no block "${id}" on this page`);
  for (const block of changes.newBlocks) {
    if (blocks.some((b) => b.id === block.id)) issues.push(`new block id "${block.id}" already exists`);
  }
  const remaining = placed.filter((block) => !changes.removeBlocks.includes(block.id));
  for (const block of [...remaining, ...changes.newBlocks]) {
    if (nextLayout.nodes[block.slot]?.kind !== "slot") issues.push(`block "${block.id}" is in "${block.slot}", which isn't a slot in the layout`);
  }
  return { layout: nextLayout, placements: remaining, issues };
}
