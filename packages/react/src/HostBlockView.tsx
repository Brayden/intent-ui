import jsonata from "jsonata";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HostBlock, HostData, HostDataResponse } from "../../../shared/api";
import { setByPointer, type Block, type BlockMeta, type BlockView } from "../../../shared/spec";
import { api } from "../../../src/lib/api";
import { BlockContent, DispatchProvider, resolveParams, RouteValuesProvider, type ActionDispatcher } from "../../../src/features/renderer";

type Loaded = { inputs: HostDataResponse["inputs"]; loading: boolean; error?: string };

/**
 * Renders a patch's generated block inside the host page. Its view reads the target element's
 * live content ($host) and, when the block declares sources, the user's connected data, loaded
 * through the Worker (same gatekeeper as generated pages). Supports the actions host blocks are
 * allowed: UI state ("set" /ui/...), "refresh" and opening external links.
 */
export function HostBlockView({ patchId, block, data }: { patchId: string; block: HostBlock; data: HostData }) {
  const [ui, setUi] = useState<Record<string, unknown>>({});
  const [view, setView] = useState<BlockView>({ data: null, inputs: {} });
  const hasSources = Object.keys(block.inputs ?? {}).length > 0;
  const [loaded, setLoaded] = useState<Loaded>({ inputs: {}, loading: hasSources });

  const load = useCallback(() => {
    if (!hasSources) return;
    setLoaded((current) => ({ ...current, loading: true }));
    api<HostDataResponse>("POST", "/api/host/data", { id: patchId })
      .then((result) => setLoaded({ inputs: result.inputs, loading: false }))
      .catch((error: Error) => setLoaded({ inputs: {}, loading: false, error: error.message }));
  }, [patchId, hasSources]);

  useEffect(load, [load, block]);

  useEffect(() => {
    if (loaded.loading && Object.keys(loaded.inputs).length === 0 && hasSources) return;
    let cancelled = false;
    const bindings: Record<string, unknown> = { host: data };
    for (const [alias, input] of Object.entries(loaded.inputs)) bindings[alias] = input.status === "ok" ? input.data : null;
    const statuses = Object.fromEntries(Object.entries(loaded.inputs).map(([alias, input]) => [alias, { status: input.status as "ok", fetchedAt: input.fetchedAt }]));
    Promise.resolve(jsonata(block.view.expr).evaluate({}, bindings))
      .then((result) => !cancelled && setView({ data: result ?? null, inputs: statuses }))
      .catch((error: Error) => !cancelled && setView({ data: null, inputs: statuses, error: error.message }));
    return () => {
      cancelled = true;
    };
  }, [block.view.expr, data, loaded, hasSources]);

  const runtime = useMemo<Block>(
    () => ({
      ...block,
      id: patchId,
      page: "host",
      slot: "host",
      order: 0,
      frame: { style: "plain", title: false, sources: false, freshness: false },
      inputs: block.inputs ?? {},
      view: { expr: block.view.expr, schema: {} },
      ui,
    }),
    [block, patchId, ui],
  );

  const meta = useMemo<BlockMeta>(() => {
    const times = Object.values(loaded.inputs).flatMap((input) => (input.fetchedAt ? [input.fetchedAt] : []));
    const connections = [...new Set((block.sources ?? []).flatMap((source) => (source.kind === "tool" ? [source.connection] : [])))];
    return { title: null, sources: connections, updatedAt: times.sort()[0] ?? null, loading: loaded.loading, web: [] };
  }, [block.sources, loaded]);

  const dispatch = useMemo<ActionDispatcher>(
    () => (action, origin) => {
      const params = resolveParams(action.params, origin.scope);
      const path = action.params?.path;
      if (action.name === "set" && typeof path === "string" && path.startsWith("/ui/")) {
        setUi((current) => setByPointer(current, path.slice("/ui".length), params.value));
      } else if (action.name === "refresh") {
        load();
      } else if (action.name === "navigate" && typeof params.url === "string" && /^https?:\/\//.test(params.url)) {
        window.open(params.url, "_blank", "noopener,noreferrer");
      }
    },
    [load],
  );

  if (loaded.error) return <p className="text-sm text-kumo-danger">This customization couldn't load its data: {loaded.error}</p>;
  if (view.error) return <p className="text-sm text-kumo-danger">This customization couldn't render: {view.error}</p>;
  return (
    <DispatchProvider dispatch={dispatch}>
      <RouteValuesProvider route={{}}>
        <BlockContent block={runtime} view={view} meta={meta} />
      </RouteValuesProvider>
    </DispatchProvider>
  );
}
