import { ApiRequestError } from "../../../lib/api";
import { useConfirm } from "../../../lib/confirm";
import { useToasts } from "../../../lib/useToasts";
import { useCallback, useState } from "react";
import type { ApiError, MaterializeResponse, Template } from "../../../../shared/api";
import { routeFromItem, setByPointer, type Action, type Block, type BlockView, type Workspace } from "../../../../shared/spec";
import { injectSpecCss, resolveParams, type ActionDispatcher, type ActionOrigin } from "../../renderer";
import { callTool, materializeIntent } from "../api";
import { blockContext } from "../lib/blockContext";
import { overlayBlock } from "../lib/overlayBlock";
import { toToolCall } from "../lib/toolAction";
import { useTemplateLibrary, type LibraryState, type PersistTemplate } from "./useTemplateLibrary";

/** The open overlay: a template rendered as a block over its parent's view model. */
export type Overlay = { template: Template; parent: Block; block: Block; view: BlockView; item: unknown };

type RuntimeOptions = {
  workspace: Workspace;
  views: Record<string, BlockView>;
  onRefresh: () => void;
  /** Writes a page block's UI state (`set` actions). */
  onSetUi: (blockId: string, path: string, value: unknown) => void;
  /** Re-researches a web source (ADR 0009). */
  onResearch: (sourceId: string) => void;
  /** Opens the page an `open: "page"` intent leads to, generating it on first use (ADR 0011). */
  onOpenPage: (intent: { id: string; prompt: string }, from: Block, item: unknown) => Promise<void>;
  /** Goes to a page in this workspace. */
  onNavigate: (pageId: string, params: Record<string, string>) => void;
  /** Sets one of the current page's route params (empty clears it); `replace` skips a history entry. */
  onSetRoute: (name: string, value: unknown, replace: boolean) => void;
  /** The saved template library, and how to persist changes to it. */
  library: LibraryState;
  onPersistTemplate: PersistTemplate;
};

/**
 * Executes actions for a workspace: resolves deferred intents to overlays (known intent →
 * instant; otherwise the server reuses a compatible template or generates one), runs tools,
 * refreshes, and navigates. Must be inside Kumo's `Toasty`.
 */
export function useIntentRuntime({ workspace, views, onRefresh, onSetUi, onResearch, onOpenPage, onNavigate, onSetRoute, library: initialLibrary, onPersistTemplate }: RuntimeOptions) {
  const toasts = useToasts();
  const confirm = useConfirm();
  const library = useTemplateLibrary(initialLibrary, onPersistTemplate);
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  const findBlock = useCallback(
    (blockId: string) => workspace.blocks[blockId] ?? (overlay?.block.id === blockId ? overlay.block : undefined),
    [workspace, overlay],
  );

  const runIntent = useCallback(
    async (action: Action, origin: ActionOrigin) => {
      const block = findBlock(origin.blockId);
      const params = resolveParams(action.params, origin.scope);
      if (!block || typeof params.id !== "string" || typeof params.prompt !== "string") {
        throw new Error("This action is missing its intent");
      }
      const show = (template: Template) =>
        setOverlay({
          template,
          parent: block,
          block: overlayBlock(template, block),
          view: views[block.id] ?? overlay?.view ?? { data: null, inputs: {} },
          item: origin.scope.item,
        });

      const { id: intentId, prompt } = params;
      const item = origin.scope.item;
      if (params.open === "page") {
        setOverlay(null);
        return onOpenPage({ id: intentId, prompt }, overlay?.block.id === block.id ? overlay.parent : block, item);
      }
      const known = library.resolve(intentId, prompt, item);
      if (known) return show(known);

      const request = {
        intent: { id: intentId, prompt },
        item,
        block: blockContext(block, workspace),
        candidates: library.candidates(item),
      };
      const { template, css } = await toasts.promise(materializeIntent(request), {
        loading: { title: "Building this for the first time…", description: prompt },
        success: (result: MaterializeResponse) =>
          result.reused
            ? { title: "Reused existing UI", description: result.reason ?? result.template.summary }
            : { title: "Built", description: "Reused instantly next time." },
        error: (error: Error) => ({ title: "Couldn't build this", description: error.message, variant: "error" }),
      });
      injectSpecCss(css);
      library.remember(intentId, prompt, template);
      show(template);
    },
    [findBlock, library, toasts, views, overlay, workspace, onOpenPage],
  );

  const runTool = useCallback(
    async (action: Action, origin: ActionOrigin) => {
      const { call, successMessage } = toToolCall(resolveParams(action.params, origin.scope));
      try {
        await callTool(call);
      } catch (error) {
        // Destructive tools need the user's go-ahead (ADR 0014): the server answers 409 with what to confirm.
        const ask = error instanceof ApiRequestError && error.status === 409 ? (error.body as ApiError).confirm : undefined;
        if (!ask) throw error;
        const ok = await confirm({
          title: `Run “${ask.tool}” on ${ask.connection}?`,
          description: ask.description || "This changes data in that service.",
          action: "Run",
          destructive: true,
        });
        if (!ok) throw new Error("Cancelled");
        await callTool({ ...call, confirmed: true });
      }
      setOverlay(null);
      toasts.add({ title: successMessage ?? "Done", variant: "success" });
      onRefresh();
    },
    [toasts, onRefresh, confirm],
  );

  const dispatch = useCallback<ActionDispatcher>(
    async (action, origin) => {
      switch (action.name) {
        case "intent":
          return runIntent(action, origin).catch(() => undefined); // surfaced by the toast
        case "tool":
          return runTool(action, origin); // errors surface in the calling form
        case "close":
          return setOverlay(null);
        case "set": {
          const { path, value, replace } = resolveParams(action.params, origin.scope);
          // The page URL (ADR 0013): route params change what data loads.
          if (typeof path === "string" && path.startsWith("/route/")) return onSetRoute(path.slice("/route/".length), value, replace === true);
          if (typeof path !== "string" || !path.startsWith("/ui/")) return;
          if (workspace.blocks[origin.blockId]) return onSetUi(origin.blockId, path, value);
          // Overlay UI state lives on the open overlay (not persisted with the template).
          return setOverlay((current) =>
            current && current.block.id === origin.blockId
              ? { ...current, block: { ...current.block, ui: setByPointer(current.block.ui, path.slice("/ui".length), value) } }
              : current,
          );
        }
        case "refresh":
          return onRefresh();
        case "research": {
          const { source } = resolveParams(action.params, origin.scope);
          if (typeof source === "string") onResearch(source);
          return;
        }
        case "navigate": {
          const { url, page, params } = resolveParams(action.params, origin.scope);
          if (typeof url === "string" && /^https?:\/\//.test(url)) return void window.open(url, "_blank", "noopener,noreferrer");
          if (typeof page !== "string") return;
          const given = params !== null && typeof params === "object" ? (params as Record<string, unknown>) : {};
          // Params the action doesn't give are filled from the clicked item via each param's `from` (ADR 0012).
          const target = workspace.pages[page];
          const filled = target ? routeFromItem(target, origin.scope.item).values : {};
          const explicit = Object.fromEntries(Object.entries(given).flatMap(([key, value]) => (value == null || value === "" ? [] : [[key, String(value)]])));
          setOverlay(null);
          return onNavigate(page, { ...filled, ...explicit });
        }
        default:
          toasts.add({ title: `"${action.name}" actions aren't supported yet` });
      }
    },
    [runIntent, runTool, onRefresh, onSetUi, onResearch, onNavigate, onSetRoute, workspace, toasts],
  );

  /** Applies an edited template to the library and to the open overlay, if it's showing it. */
  const updateTemplate = useCallback(
    (template: Template) => {
      library.update(template);
      setOverlay((current) =>
        current?.template.id === template.id
          ? { ...current, template, block: overlayBlock(template, current.parent) }
          : current,
      );
    },
    [library],
  );

  return { dispatch, overlay, updateTemplate };
}
