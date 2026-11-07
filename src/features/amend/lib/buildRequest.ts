import type { AmendRequest } from "../../../../shared/api";
import { blockMeta, type BlockView, type RouteValues, type Workspace } from "../../../../shared/spec";
import { blockContext, type Overlay } from "../../intents";
import type { ElementTarget } from "../../renderer";
import { dataSample } from "./dataSample";

/** The page and where its blocks sit, as the edit endpoint expects it. */
function pageContext(workspace: Workspace, pageId: string): AmendRequest["page"] {
  const page = workspace.pages[pageId];
  if (!page) return undefined;
  const blocks = Object.values(workspace.blocks)
    .filter((block) => block.page === pageId)
    .map(({ id, slot, order, title, frame }) => ({ id, slot, order, title, frame }));
  return { id: page.id, layout: page.layout, blocks, params: Object.keys(page.params) };
}

/** `route`: the current page's route values (ADR 0011), for dry runs. */
type Context = { workspace: Workspace; views: Record<string, BlockView>; overlay: Overlay | null; route: RouteValues };

/** Builds an edit request for any right-click target, or null if the target is gone. */
export function buildAmendRequest(target: ElementTarget, prompt: string, { workspace, views, overlay, route }: Context): AmendRequest | null {
  const description = target.label;

  if (target.kind === "layout") {
    return { prompt, kind: "page", target: { description, nodeId: target.nodeId }, page: pageContext(workspace, target.pageId), spec: workspace, route };
  }

  const pageBlock = workspace.blocks[target.blockId];
  const overlayBlock = overlay?.block.id === target.blockId ? overlay : null;
  const block = pageBlock ?? overlayBlock?.block;
  if (!block) return null;

  // Overlays describe and read data through the page block they were opened from.
  const contextBlock = pageBlock ?? overlayBlock?.parent ?? block;
  const contextView = views[contextBlock.id] ?? { data: null, inputs: {} };
  const sample = dataSample(contextView.data);
  const meta = blockMeta(contextBlock, contextView, workspace);
  return {
    prompt,
    kind: pageBlock ? "block" : "overlay",
    target: { description, nodeId: target.kind === "node" ? target.nodeId : undefined },
    tree: { root: block.root, toolbar: block.toolbar, nodes: block.nodes },
    block: blockContext(contextBlock, workspace),
    dataSample: { ...(sample !== null && typeof sample === "object" ? sample : {}), ui: block.ui, meta },
    item: target.kind === "node" ? target.scope.item : undefined,
    page: pageBlock ? pageContext(workspace, pageBlock.page) : undefined,
    // Lets the edit change where a page block's data comes from (sources, view).
    spec: pageBlock ? workspace : undefined,
    route,
  };
}
