import { isTruthy, researchValues, sameValues, type ResearchSource, type RouteValues, type Source, type SourceResult, type ToolSource, type Workspace } from "../../shared/spec";
import { findTool } from "../connections/registry";
import { asCollection, evaluate, type EvaluateOptions } from "./jsonata";

/** Resolves a source's args: literals pass through; `{ expr }` is JSONata over its inputs. */
async function resolveArgs(source: ToolSource, bindings: Record<string, unknown>, clock: EvaluateOptions): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    Object.entries(source.args).map(async ([key, value]) => {
      if (value !== null && typeof value === "object" && "expr" in value) return [key, await evaluate(value.expr, {}, bindings, clock)];
      return [key, value];
    }),
  );
  return Object.fromEntries(entries);
}

/** Calls a connection's tool. The default goes through the gatekeeper's registry. */
export type ToolCaller = (connection: string, tool: string, args: Record<string, unknown>) => Promise<unknown>;

const callRegisteredTool: ToolCaller = (connectionId, tool, args) => findTool(connectionId, tool).connection.call(tool, args);

/**
 * A tool caller that makes each distinct call once (same connection, tool and args), e.g. so a
 * dry run reuses data fetched while the model was still writing (ADR 0017).
 */
export function memoizedToolCaller(call: ToolCaller = callRegisteredTool): ToolCaller {
  const calls = new Map<string, Promise<unknown>>();
  return (connection, tool, args) => {
    const key = JSON.stringify([connection, tool, args]);
    let result = calls.get(key);
    if (!result) calls.set(key, (result = call(connection, tool, args)));
    return result;
  };
}

/**
 * How one page load evaluates sources. `asOf` (epoch ms) is the load's clock: `$now()` in every
 * expression returns it (RFC 0003 §5.6). `callTool` lets conformance runs supply recorded results.
 */
export type RunOptions = { resolveResearch?: ResearchResolver; callTool?: ToolCaller; asOf?: number };

/** Runs one tool source: resolve args → call the tool → normalize. Failures become error results. */
async function runToolSource(source: ToolSource, bindings: Record<string, unknown>, options: RunOptions): Promise<SourceResult> {
  // Results are stamped with the load's clock, so a replay with the same `asOf` is identical.
  const fetchedAt = new Date(options.asOf ?? Date.now()).toISOString();
  const clock = { asOf: options.asOf };
  try {
    if (source.when !== undefined && !isTruthy(await evaluate(source.when, {}, bindings, clock))) {
      return { status: "ok", data: source.key ? [] : null, complete: true, fetchedAt };
    }
    const call = options.callTool ?? callRegisteredTool;
    const raw = await call(source.connection, source.tool, await resolveArgs(source, bindings, clock));
    const normalized = await evaluate(source.normalize, raw, bindings, clock);
    // A source with an item key is a collection (ADR 0001 §4), whatever JSONata returned.
    const data = source.key ? asCollection(normalized) : normalized;
    return { status: "ok", data, complete: true, fetchedAt };
  } catch (error) {
    return { status: "error", data: null, complete: false, fetchedAt, error: (error as Error).message };
  }
}

/** Researches a parameterized source for one set of route values (cached by the caller). */
export type ResearchResolver = (source: ResearchSource, values: RouteValues) => Promise<SourceResult>;

/**
 * Researched data (ADR 0009) is served as last extracted. A parameterized source (ADR 0012) has
 * data per route value: its example snapshot when the values match, else the resolver's (which
 * researches and caches). Without a resolver (dry runs) the example stands in.
 */
async function researchResult(source: ResearchSource, route: RouteValues, resolve?: ResearchResolver): Promise<SourceResult> {
  const snapshot: SourceResult = { status: "ok", data: source.data, complete: true, fetchedAt: source.provenance.researchedAt };
  if (source.params.length === 0) return snapshot;
  const values = researchValues(source, route);
  if (!values) return { status: "error", data: null, complete: false, fetchedAt: new Date().toISOString(), error: `Needs route params: ${source.params.join(", ")}` };
  if (sameValues(values, source.dataFor) || !resolve) return snapshot;
  return resolve(source, values);
}

/**
 * Runs the given sources and everything they depend on, in dependency order, in parallel
 * waves. Each source runs once per call even if several sources or blocks need it. The page's
 * route values are bound as `$route` in args and normalize expressions (ADR 0011).
 */
export async function runSources(
  workspace: Workspace,
  ids: string[],
  route: RouteValues = {},
  options: RunOptions = {},
): Promise<Record<string, SourceResult>> {
  const asOf = options.asOf ?? Date.now();
  const results: Record<string, SourceResult> = {};
  const running = new Map<string, Promise<SourceResult>>();

  const run = (id: string, path: string[] = []): Promise<SourceResult> => {
    const existing = running.get(id);
    if (existing) return existing;
    const source: Source | undefined = workspace.sources[id];
    const promise = (async (): Promise<SourceResult> => {
      const now = new Date(asOf).toISOString();
      if (!source) return { status: "error", data: null, complete: false, fetchedAt: now, error: `Unknown source "${id}"` };
      if (path.includes(id)) return { status: "error", data: null, complete: false, fetchedAt: now, error: `Cycle at source "${id}"` };
      if (source.kind === "local") return { status: "ok", data: source.data, complete: true, fetchedAt: now };
      // Researched data is served as last extracted; it's refreshed on request (ADR 0009).
      if (source.kind === "research") return researchResult(source, route, options.resolveResearch);

      const inputs = Object.entries(source.inputs ?? {});
      const deps = await Promise.all(inputs.map(async ([alias, depId]) => [alias, await run(depId, [...path, id])] as const));
      const failed = deps.find(([, result]) => result.status !== "ok");
      if (failed) return { status: "error", data: null, complete: false, fetchedAt: now, error: `Input "${failed[0]}" failed` };
      return runToolSource(source, { ...Object.fromEntries(deps.map(([alias, result]) => [alias, result.data])), route }, { ...options, asOf });
    })();
    running.set(id, promise);
    return promise;
  };

  await Promise.all(ids.map(async (id) => (results[id] = await run(id))));
  for (const [id, promise] of running) results[id] ??= await promise;
  return results;
}
