import type { ToolInfo } from "../../shared/api";
import { fillPlaceholders, type ResearchSource, type RouteValues, type SourceResult } from "../../shared/spec";
import type { ResearchResolver } from "../data/sources";
import type { Env } from "../env";
import { refreshResearch } from "./refresh";

type Cache = { getCached(key: string): Promise<string | null>; putCached(key: string, json: string): Promise<void> };
type Cached = { data: unknown; researchedAt: string; citations: string[] };

/** Same recipe + same values → same cache entry; editing the recipe starts fresh. */
const cacheKey = (source: ResearchSource, values: RouteValues) =>
  `research:${source.id}:${JSON.stringify([source.query, source.instructions, Object.entries(values).sort()])}`;

/** In-flight research by key, so concurrent loads of the same page share one run (per isolate). */
const inFlight = new Map<string, Promise<SourceResult>>();

/**
 * Resolves parameterized research sources (ADR 0012): cached rows for these route values, else
 * replays the recipe with `{placeholders}` filled (a model call with web search) and caches it.
 */
export function routeResearch(env: Env, cache: Cache, tools: ToolInfo[]): ResearchResolver {
  return async (source, values) => {
    const key = cacheKey(source, values);
    const hit = await cache.getCached(key);
    if (hit) {
      const cached = JSON.parse(hit) as Cached;
      return { status: "ok", data: cached.data, complete: true, fetchedAt: cached.researchedAt };
    }
    const running = inFlight.get(key);
    if (running) return running;

    const run = (async (): Promise<SourceResult> => {
      const concrete: ResearchSource = {
        ...source,
        query: fillPlaceholders(source.query, values),
        instructions: fillPlaceholders(source.instructions, values),
      };
      try {
        const result = await refreshResearch(env, concrete, tools, true);
        const refreshed = result.source;
        if (refreshed.kind !== "research") throw new Error("Unexpected research result");
        const cached: Cached = { data: refreshed.data, researchedAt: refreshed.provenance.researchedAt, citations: refreshed.provenance.citations };
        await cache.putCached(key, JSON.stringify(cached));
        return { status: "ok", data: refreshed.data, complete: true, fetchedAt: cached.researchedAt };
      } catch (error) {
        return { status: "error", data: null, complete: false, fetchedAt: new Date().toISOString(), error: `Couldn't research this: ${(error as Error).message}` };
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, run);
    return run;
  };
}
