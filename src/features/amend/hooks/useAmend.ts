import { useToasts } from "../../../lib/useToasts";
import { useCallback, useState } from "react";
import type { Template } from "../../../../shared/api";
import {
  applyBlockOps,
  templateRequirements,
  type BlockData,
  type BlockTree,
  type BlockView,
  type PageChanges,
  type Source,
  type Workspace,
  type RouteValues,
  type PageParam,
} from "../../../../shared/spec";
import type { Overlay } from "../../intents";
import { injectSpecCss, type ElementTarget } from "../../renderer";
import { amendElement } from "../api";
import { buildAmendRequest } from "../lib/buildRequest";

type AmendOptions = {
  workspace: Workspace;
  views: Record<string, BlockView>;
  overlay: Overlay | null;
  /** The current page's route values (ADR 0011). */
  route: RouteValues;
  onBlockTree: (blockId: string, tree: BlockTree) => void;
  onTemplate: (template: Template) => void;
  /** `sourceBlockId` is the block new blocks take their data from, if any. */
  onPage: (pageId: string, changes: PageChanges, sourceBlockId?: string) => void;
  /** Applies a data change to a block (sources + its inputs/view/fields). */
  onData: (blockId: string, sources: Source[], data?: BlockData) => void;
  /** Shows views computed by the server's dry run. */
  onViews: (views: Record<string, BlockView>) => void;
  /**
   * Page-level changes (a right-clicked layout element) go through compose, which can change
   * anything on the page: layout, blocks, data, and route params (ADR 0012). Resolves true on success.
   */
  onPageEdit: (prompt: string) => Promise<boolean>;
  /** Replaces a page's route params (an edit that adds e.g. a search query param). */
  onPageParams: (pageId: string, params: Record<string, PageParam>) => void;
};

/** Right-click edits for anything on the page: builds the request and applies the result. */
export function useAmend({ workspace, views, overlay, route, onBlockTree, onTemplate, onPage, onData, onViews, onPageEdit, onPageParams }: AmendOptions) {
  const toasts = useToasts();
  const [target, setTarget] = useState<ElementTarget | null>(null);
  const [pending, setPending] = useState(false);

  const submit = useCallback(
    async (prompt: string) => {
      if (!target) return;
      if (target.kind === "layout") {
        setPending(true);
        const done = await onPageEdit(`About ${target.label} (page layout node "${target.nodeId}"): ${prompt}`);
        setPending(false);
        if (done) setTarget(null);
        return;
      }
      const request = buildAmendRequest(target, prompt, { workspace, views, overlay, route });
      if (!request) return setTarget(null);

      setPending(true);
      try {
        const result = await amendElement(request);
        setTarget(null);
        if (result.status === "declined") {
          toasts.add({ title: "Can't make that change yet", description: result.reason, variant: "warning" });
          return;
        }
        injectSpecCss(result.css);
        const blockId = target.blockId;
        if (request.tree && result.ops.length > 0) {
          const next = applyBlockOps(request.tree, result.ops);
          if (request.kind === "block" && blockId) onBlockTree(blockId, next);
          if (request.kind === "overlay" && overlay) onTemplate({ ...overlay.template, ...next, ...templateRequirements(next) });
        }
        if (result.pageParams && request.page) onPageParams(request.page.id, result.pageParams);
        // Data first, so new blocks added next to this one pick up its new data.
        if (result.data && blockId) onData(blockId, result.data.sources, result.data.block);
        if (result.views) onViews(result.views);
        if (result.page && request.page) onPage(request.page.id, result.page, request.kind === "block" ? blockId : undefined);
        toasts.add({ title: "Updated", description: result.summary, variant: "success" });
      } catch (error) {
        toasts.add({ title: "Couldn't change this", description: (error as Error).message, variant: "error" });
      } finally {
        setPending(false);
      }
    },
    [target, workspace, overlay, views, route, onBlockTree, onTemplate, onPage, onData, onViews, onPageEdit, onPageParams, toasts],
  );

  return { target, pending, open: setTarget, close: useCallback(() => setTarget(null), []), submit };
}
