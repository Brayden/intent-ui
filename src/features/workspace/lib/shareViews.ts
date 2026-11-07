import type { Block, BlockView, Workspace } from "../../../../shared/spec";

const viewKey = (block: Block) => JSON.stringify([block.inputs, block.view.expr]);

/**
 * Fills in views for blocks that have none yet but compute exactly the same thing as a block
 * that does (same inputs and view expression), e.g. a block added next to another during an
 * edit. The workspace agent will compute these directly; the result is identical.
 */
export function shareViews(workspace: Workspace, views: Record<string, BlockView>): Record<string, BlockView> {
  const byKey = new Map<string, BlockView>();
  for (const block of Object.values(workspace.blocks)) {
    const view = views[block.id];
    if (view) byKey.set(viewKey(block), view);
  }
  const shared = { ...views };
  for (const block of Object.values(workspace.blocks)) {
    if (!shared[block.id]) {
      const view = byKey.get(viewKey(block));
      if (view) shared[block.id] = view;
    }
  }
  return shared;
}
