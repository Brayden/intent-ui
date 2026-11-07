import { z } from "zod";
import { BlockNodeSchema, type BlockTree } from "./nodes";

/**
 * Atomic edits to a block tree (RFC 0001 §8.1). Moves and child reordering are expressed by
 * upserting the parent with a new `children` list. `setRoot` re-points the body (e.g. to a
 * new Stack wrapping the old root); `setToolbar` sets or clears the header toolbar root.
 */
export const BlockOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("upsert"), id: z.string().min(1), node: BlockNodeSchema }),
  z.object({ op: z.literal("remove"), id: z.string().min(1) }),
  z.object({ op: z.literal("setRoot"), id: z.string().min(1) }),
  z.object({ op: z.literal("setToolbar"), id: z.string().min(1).nullable() }),
]);
export type BlockOp = z.infer<typeof BlockOpSchema>;

function descendants(tree: BlockTree, id: string, into = new Set<string>()): Set<string> {
  for (const child of tree.nodes[id]?.children ?? []) {
    if (into.has(child)) continue;
    into.add(child);
    descendants(tree, child, into);
  }
  return into;
}

/** Ids of the nodes above `id`, nearest first. */
export function ancestorsOf(tree: BlockTree, id: string): string[] {
  const parentOf = new Map<string, string>();
  for (const [parentId, node] of Object.entries(tree.nodes)) {
    for (const child of node.children ?? []) parentOf.set(child, parentId);
  }
  const chain: string[] = [];
  for (let current = parentOf.get(id); current && !chain.includes(current); current = parentOf.get(current)) {
    chain.push(current);
  }
  return chain;
}

/** The node and everything under it. */
export function subtreeOf(tree: BlockTree, id: string): Set<string> {
  return descendants(tree, id, new Set([id]));
}

/**
 * Applies ops in order and returns a new tree. Removing a node also removes its subtree and
 * drops it from any parent's `children`. Pure and deterministic: client and server agree.
 */
export function applyBlockOps(tree: BlockTree, ops: BlockOp[]): BlockTree {
  const nodes = { ...tree.nodes };
  let { root, toolbar } = tree;
  for (const op of ops) {
    if (op.op === "upsert") nodes[op.id] = op.node;
    else if (op.op === "setRoot") root = op.id;
    else if (op.op === "setToolbar") toolbar = op.id ?? undefined;
    else {
      for (const id of subtreeOf({ root, nodes }, op.id)) delete nodes[id];
      for (const [id, node] of Object.entries(nodes)) {
        if (node.children?.includes(op.id)) nodes[id] = { ...node, children: node.children.filter((c) => c !== op.id) };
      }
      if (toolbar === op.id) toolbar = undefined;
    }
  }
  return toolbar ? { root, toolbar, nodes } : { root, nodes };
}
