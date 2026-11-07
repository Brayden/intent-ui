import type { BlockView, Workspace } from "./workspace";
import type { Block } from "./workspace";

/**
 * Facts about a block that its chrome shows (title, sources, freshness, loading), exposed to
 * the block's own tree at `/meta/...` so any of it can be rebuilt anywhere (ADR 0007).
 * `meta` is reserved in view models, like `ui`.
 */
export type BlockMeta = {
  title: string | null;
  /** Connections behind the block's inputs, e.g. ["acme-hr", "github"]. */
  sources: string[];
  /** Oldest fetch time across the block's inputs (ISO string), or null before any data. */
  updatedAt: string | null;
  /** True while any input is (re)loading, e.g. after a refresh. */
  loading: boolean;
  /** Web-sourced inputs, with citations (ADR 0009). "fetch" refreshes with the page; "research" on request. */
  web: WebSourceMeta[];
};

export type WebSourceMeta = {
  sourceId: string;
  method: "fetch" | "research";
  researchedAt: string;
  citations: string[];
  query?: string;
};

export function blockMeta(block: Block, view: BlockView, workspace: Workspace): BlockMeta {
  const sources = new Set<string>();
  const web: WebSourceMeta[] = [];
  for (const sourceId of Object.values(block.inputs)) {
    const source = workspace.sources[sourceId];
    if (source?.kind === "tool") sources.add(source.connection);
    if (source?.kind === "research") sources.add("web");
    if ((source?.kind === "tool" || source?.kind === "research") && source.provenance) {
      const { researchedAt, citations, query } = source.provenance;
      web.push({ sourceId, method: source.kind === "tool" ? "fetch" : "research", researchedAt, citations, query });
    }
  }
  const inputs = Object.values(view.inputs);
  const fetched = inputs
    .map((input) => input.fetchedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    title: block.title ?? null,
    sources: [...sources],
    updatedAt: fetched[0] ?? null,
    loading: inputs.some((input) => input.status === "loading"),
    web,
  };
}
