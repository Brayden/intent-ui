import { useCallback, useState } from "react";
import {
  applyBlockData,
  applyComposeChanges,
  applyPageChanges,
  setByPointer,
  type Block,
  type BlockData,
  type BlockTree,
  type ComposeChanges,
  type Page,
  type PageChanges,
  type Source,
  type Workspace,
} from "../../../../shared/spec";

/**
 * The workspace spec as editable state. Every change is autosaved (see `useAutosave`), and the
 * server validates each save (ADR 0008).
 */
export function useWorkspace(initial: Workspace) {
  const [workspace, setWorkspace] = useState(initial);

  /** Replaces one block's component tree (e.g. after a pointed edit). */
  const replaceBlockTree = useCallback((blockId: string, tree: BlockTree) => {
    setWorkspace((current) => {
      const block = current.blocks[blockId];
      if (!block) return current;
      const next = { ...block, root: tree.root, toolbar: tree.toolbar, nodes: tree.nodes };
      return { ...current, blocks: { ...current.blocks, [blockId]: next } };
    });
  }, []);

  /** Writes one block's UI state; `path` is a `/ui/...` pointer. */
  const setBlockUi = useCallback((blockId: string, path: string, value: unknown) => {
    setWorkspace((current) => {
      const block = current.blocks[blockId];
      if (!block || !path.startsWith("/ui/")) return current;
      const ui = setByPointer(block.ui, path.slice("/ui".length), value);
      return { ...current, blocks: { ...current.blocks, [blockId]: { ...block, ui } } };
    });
  }, []);

  /**
   * Applies page-level changes from an edit: new layout, moved/patched/removed blocks, and new
   * blocks (reading the same data as `sourceBlockId`, or none). Validated by the server and
   * re-checked here.
   */
  const applyPage = useCallback((pageId: string, changes: PageChanges, sourceBlockId?: string) => {
    setWorkspace((current) => {
      const page = current.pages[pageId];
      const source = sourceBlockId ? current.blocks[sourceBlockId] : undefined;
      if (!page) return current;
      const onPage = Object.values(current.blocks).filter((block) => block.page === pageId);
      const result = applyPageChanges(page.layout, onPage, changes);
      if (result.issues.length > 0) return current;

      const blocks = { ...current.blocks };
      for (const placed of result.placements) {
        const existing = blocks[placed.id];
        if (existing) blocks[placed.id] = { ...existing, slot: placed.slot, order: placed.order };
      }
      for (const patch of changes.blockPatches) {
        const existing = blocks[patch.blockId];
        if (!existing) continue;
        const title = patch.title === undefined ? existing.title : (patch.title ?? undefined);
        blocks[patch.blockId] = { ...existing, title, frame: { ...existing.frame, ...patch.frame } };
      }
      for (const id of changes.removeBlocks) delete blocks[id];
      for (const added of changes.newBlocks) {
        const block: Block = {
          ...added,
          page: pageId,
          inputs: source?.inputs ?? {},
          view: source?.view ?? { expr: "{}", schema: { type: "object" } },
          fields: source?.fields,
          ui: {},
        };
        blocks[added.id] = block;
      }
      return { ...current, pages: { ...current.pages, [pageId]: { ...page, layout: result.layout } }, blocks };
    });
  }, []);

  /** Applies chat (compose) changes: sources, layout, and new blocks. Validated by the server. */
  const applyCompose = useCallback((pageId: string, changes: ComposeChanges) => {
    setWorkspace((current) => {
      const result = applyComposeChanges(current, pageId, changes);
      return result.issues.length > 0 ? current : result.workspace;
    });
  }, []);

  /** Rewires a block's data (new inputs/view/fields) and adds/replaces sources. Validated by the server. */
  const applyBlockDataChange = useCallback((blockId: string, sources: Source[], data?: BlockData) => {
    setWorkspace((current) => {
      const result = applyBlockData(current, blockId, data, sources);
      return result.issues.length > 0 ? current : result.workspace;
    });
  }, []);

  /** Replaces one data source (e.g. after re-researching it from the web). */
  const replaceSource = useCallback((source: Source) => {
    setWorkspace((current) => ({ ...current, sources: { ...current.sources, [source.id]: source } }));
  }, []);

  /** Replaces a page's route params (ADR 0013). */
  const setPageParams = useCallback((pageId: string, params: Page["params"]) => {
    setWorkspace((current) => {
      const page = current.pages[pageId];
      return page ? { ...current, pages: { ...current.pages, [pageId]: { ...page, params } } } : current;
    });
  }, []);

  /** Adds a generated page (ADR 0011) and builds it, in one update. */
  const addPage = useCallback((page: Page, changes: ComposeChanges) => {
    setWorkspace((current) => {
      const withPage = { ...current, pages: { ...current.pages, [page.id]: page } };
      const result = applyComposeChanges(withPage, page.id, changes);
      return result.issues.length > 0 ? current : result.workspace;
    });
  }, []);

  return { workspace, replaceBlockTree, setBlockUi, applyPage, applyCompose, applyBlockDataChange, replaceSource, addPage, setPageParams };
}
