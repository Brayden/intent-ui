import type { DraftBlockHeader, DraftPageHeader, DraftStreamEvent } from "../../../../shared/api";
import {
  applyLayoutOps,
  blankWorkspace,
  type Block,
  type BlockNode,
  type BlockView,
  type LayoutOp,
  type Page,
  type RouteValues,
  type Source,
  type Workspace,
} from "../../../../shared/spec";

/**
 * A compose in progress (ADR 0017): what the model has written so far, shown on the page but
 * never saved. The validated result replaces it.
 */
export type ComposeDraft = {
  status?: string;
  sources: Source[];
  layoutOps: LayoutOp[];
  /** Block ids in the order they arrived. */
  blocks: string[];
  headers: Record<string, DraftBlockHeader>;
  nodes: Record<string, Record<string, BlockNode>>;
  /** Early data for finished blocks. */
  views: Record<string, BlockView>;
  pageTitle?: string;
  /** A page being generated (ADR 0011): it isn't in the workspace until the result. */
  page?: DraftPageHeader;
  /** Its route values, once the model has written its params. */
  route?: RouteValues;
};

export const EMPTY_DRAFT: ComposeDraft = { sources: [], layoutOps: [], blocks: [], headers: {}, nodes: {}, views: {} };

/** Applies one stream event. Pure. */
export function reduceDraft(draft: ComposeDraft, event: DraftStreamEvent): ComposeDraft {
  switch (event.type) {
    case "status":
      return { ...draft, status: event.message };
    case "reset":
      // A repair starts over, but the page being generated stays open.
      return { ...EMPTY_DRAFT, status: draft.status, page: draft.page, route: draft.route };
    case "page":
      return { ...draft, page: { ...draft.page, ...event.page }, route: event.route ?? draft.route };
    case "source":
      return { ...draft, sources: [...draft.sources.filter((source) => source.id !== event.source.id), event.source] };
    case "layout":
      return { ...draft, layoutOps: [...draft.layoutOps, event.op] };
    case "block": {
      const known = draft.blocks.includes(event.block.id);
      return { ...draft, blocks: known ? draft.blocks : [...draft.blocks, event.block.id], headers: { ...draft.headers, [event.block.id]: event.block } };
    }
    case "node":
      return { ...draft, nodes: { ...draft.nodes, [event.blockId]: { ...draft.nodes[event.blockId], [event.id]: event.node } } };
    case "view":
      return { ...draft, views: { ...draft.views, [event.blockId]: event.view } };
    case "pageTitle":
      return { ...draft, pageTitle: event.title };
    default:
      return draft; // css is injected by the caller; result and error end the draft
  }
}

/** Root id for a draft block whose root hasn't arrived: renders as a placeholder. */
export const PENDING_ROOT = "__pending";
const DEFAULT_FRAME = { style: "card", title: true, sources: true, freshness: true } as const;

/**
 * The workspace as it will look with the draft applied, for rendering only. Blocks show as soon
 * as their slot exists; nodes that haven't arrived render as placeholders.
 */
export function draftWorkspace(workspace: Workspace, pageId: string, draft: ComposeDraft): Workspace {
  const page = workspace.pages[pageId] ?? (draft.page?.id === pageId ? newPage(draft.page) : undefined);
  if (!page) return workspace;
  const layout = draft.layoutOps.length > 0 ? applyLayoutOps(page.layout, draft.layoutOps) : page.layout;
  const sources = { ...workspace.sources };
  for (const source of draft.sources) sources[source.id] = source;
  const blocks = { ...workspace.blocks };
  draft.blocks.forEach((id, index) => {
    const header = draft.headers[id];
    if (!header || layout.nodes[header.slot]?.kind !== "slot") return;
    const block: Block = {
      id,
      page: pageId,
      slot: header.slot,
      order: header.order ?? 1000 + index,
      title: header.title,
      frame: header.frame ?? DEFAULT_FRAME,
      root: header.root ?? PENDING_ROOT,
      toolbar: header.toolbar,
      nodes: draft.nodes[id] ?? {},
      inputs: header.inputs ?? {},
      view: { expr: "{}", schema: {} },
      ui: {},
    };
    blocks[id] = block;
  });
  const pages = { ...workspace.pages, [pageId]: { ...page, layout, title: draft.pageTitle ?? page.title } };
  return { ...workspace, pages, sources, blocks };
}

/** A generated page as known so far: the layout every generated page starts from. */
function newPage(header: DraftPageHeader): Page {
  return { id: header.id, title: header.title ?? "New page", layout: blankWorkspace("").pages.home!.layout, params: header.params ?? {}, intent: header.intent };
}

/** Views for draft blocks: early data when it has arrived, else every input loading. */
export function draftViews(draft: ComposeDraft): Record<string, BlockView> {
  return Object.fromEntries(
    draft.blocks.map((id) => {
      const loading: BlockView = {
        data: null,
        inputs: Object.fromEntries(Object.keys(draft.headers[id]?.inputs ?? {}).map((alias) => [alias, { status: "loading" as const }])),
      };
      return [id, draft.views[id] ?? loading];
    }),
  );
}
