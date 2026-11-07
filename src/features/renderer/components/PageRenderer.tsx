import type { ReactNode } from "react";
import { blockMeta, type Block, type BlockView, type LayoutNode, type Workspace } from "../../../../shared/spec";
import { useLayoutTargetHandler } from "../targeting";
import { BlockProvider, useRouteValues } from "../context";
import { blockScope } from "../lib/blockScope";
import { BlockFrame } from "./BlockFrame";
import { LayoutNodeElement } from "./LayoutNodeElement";
import { NodeError } from "./NodeError";
import { NodeRenderer } from "./NodeRenderer";

type PageRendererProps = {
  workspace: Workspace;
  pageId: string;
  views: Record<string, BlockView>;
};

const EMPTY_VIEW: BlockView = { data: null, inputs: {} };

/** One block on the page: frame (title, sources, toolbar) around its body. */
function PageBlock({ block, view, workspace }: { block: Block; view: BlockView; workspace: Workspace }) {
  const meta = blockMeta(block, view, workspace);
  const scope = blockScope(block, view, meta, undefined, useRouteValues());
  return (
    <BlockProvider runtime={{ block, view }}>
      <BlockFrame
        block={block}
        meta={meta}
        toolbar={block.toolbar ? <NodeRenderer id={block.toolbar} scope={scope} /> : null}
      >
        <NodeRenderer id={block.root} scope={scope} />
      </BlockFrame>
    </BlockProvider>
  );
}

/** Renders a page: its freeform layout, with blocks mounted into slots. */
export function PageRenderer({ workspace, pageId, views }: PageRendererProps) {
  const page = workspace.pages[pageId];
  if (!page) return <NodeError id={pageId} message="Unknown page" />;

  const blocksIn = (slotId: string) =>
    Object.values(workspace.blocks)
      .filter((block) => block.page === pageId && block.slot === slotId)
      .sort((a, b) => a.order - b.order);

  const renderLayoutNode = (id: string) => {
    const node = page.layout.nodes[id];
    if (!node) return <NodeError key={id} id={id} message="Unknown layout node" />;
    return (
      <LayoutNodeElement key={id} pageId={pageId} id={id} node={node}>
        {node.kind === "html"
          ? node.children?.map(renderLayoutNode)
          : blocksIn(id).map((block) => (
              <PageBlock key={block.id} block={block} view={views[block.id] ?? EMPTY_VIEW} workspace={workspace} />
            ))}
      </LayoutNodeElement>
    );
  };

  return (
    <PageBackground pageId={pageId} rootId={page.layout.root} root={page.layout.nodes[page.layout.root]}>
      {renderLayoutNode(page.layout.root)}
    </PageBackground>
  );
}

type PageBackgroundProps = { pageId: string; rootId: string; root: LayoutNode | undefined; children: ReactNode };

/** Fills the viewport so right-clicking empty space outside the layout targets the layout root. */
function PageBackground({ pageId, rootId, root, children }: PageBackgroundProps) {
  const onContextMenu = useLayoutTargetHandler(pageId, rootId, root ?? { kind: "slot" });
  return (
    <div className="min-h-screen" onContextMenu={onContextMenu}>
      {children}
    </div>
  );
}
