import { useToasts } from "../../../lib/useToasts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockView, RouteValues } from "../../../../shared/spec";
import { refreshData } from "../api";

/** Marks every input of every view as loading, keeping the last data on screen meanwhile. */
function markLoading(views: Record<string, BlockView>): Record<string, BlockView> {
  return Object.fromEntries(
    Object.entries(views).map(([id, view]) => [
      id,
      { ...view, inputs: Object.fromEntries(Object.entries(view.inputs).map(([alias, input]) => [alias, { ...input, status: "loading" as const }])) },
    ]),
  );
}

/**
 * A page's block views: starts from saved snapshots (instant), then refreshes from the sources
 * (ADR 0001 §6), and again whenever the page or its route values change (ADR 0011). `refresh`
 * re-runs them (refresh buttons, `refresh` actions); `merge` adds views computed elsewhere (e.g.
 * a compose result's dry run).
 */
export function useWorkspaceData(
  workspaceId: string,
  pageId: string,
  route: RouteValues,
  snapshots: Record<string, BlockView>,
  /** Saves pending edits first: the server computes data from the saved spec. */
  flush: () => Promise<unknown>,
  /** Blocks that read the route: the only ones reloaded when just the route changes (ADR 0013). */
  routeBlocks: string[],
  /** A page still being generated isn't saved yet: don't load it (its draft brings its data). */
  skip = false,
) {
  const toasts = useToasts();
  const [views, setViews] = useState(snapshots);
  const routeKey = JSON.stringify(route);
  const current = useRef("");
  current.current = `${pageId}?${routeKey}`;
  const loadedPage = useRef<string | null>(null);
  const routeBlocksKey = routeBlocks.join(",");

  /** Reloads the page's data; `onlyRoute` reloads just the blocks that read the route. */
  const load = useCallback(async (onlyRoute: boolean) => {
    const requested = `${pageId}?${routeKey}`;
    const blocks = onlyRoute ? routeBlocksKey.split(",").filter(Boolean) : undefined;
    setViews((existing) => (blocks ? { ...existing, ...markLoading(Object.fromEntries(blocks.flatMap((id) => (existing[id] ? [[id, existing[id]]] : [])))) } : markLoading(existing)));
    try {
      await flush();
      const { views: fresh } = await refreshData(workspaceId, pageId, JSON.parse(routeKey) as RouteValues, blocks);
      // Drop results for a page or route the user has already left.
      if (current.current === requested) setViews((existing) => ({ ...existing, ...fresh }));
    } catch (error) {
      toasts.add({ title: "Couldn't refresh data", description: (error as Error).message, variant: "error" });
    }
  }, [workspaceId, pageId, routeKey, routeBlocksKey, flush, toasts]);
  const refresh = useCallback(() => load(false), [load]);

  const loaded = useRef("");
  useEffect(() => {
    if (loaded.current === current.current) return; // once per page + route (StrictMode runs effects twice)
    loaded.current = current.current;
    const samePage = loadedPage.current === pageId;
    loadedPage.current = pageId;
    if (skip) return;
    void load(samePage);
  }, [load, pageId, skip]);

  const merge = useCallback((fresh: Record<string, BlockView>) => setViews((existing) => ({ ...existing, ...fresh })), []);
  return { views, refresh, merge };
}
