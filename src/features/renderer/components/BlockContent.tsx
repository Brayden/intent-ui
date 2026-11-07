import type { Block, BlockMeta, BlockView } from "../../../../shared/spec";
import { BlockProvider, useRouteValues } from "../context";
import { blockScope } from "../lib/blockScope";
import { NodeRenderer } from "./NodeRenderer";

type BlockContentProps = { block: Block; view: BlockView; meta: BlockMeta; item?: unknown };

/** Renders a block's body tree against its view model, UI state, and meta (and optional `$item`). */
export function BlockContent({ block, view, meta, item }: BlockContentProps) {
  const route = useRouteValues();
  return (
    <BlockProvider runtime={{ block, view }}>
      <NodeRenderer id={block.root} scope={blockScope(block, view, meta, item, route)} />
    </BlockProvider>
  );
}
