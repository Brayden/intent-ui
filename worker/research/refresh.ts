import { z } from "zod";
import type { ResearchRefreshResponse, ToolInfo } from "../../shared/api";
import { describeIssues, ToolSourceSchema, type ResearchSource, type Workspace } from "../../shared/spec";
import { INSPECT_TOOL, observer } from "../compose/tools";
import { runSources } from "../data/sources";
import type { Env } from "../env";
import { WEB_SEARCH_TOOL, type ToolDefinition } from "../llm/anthropic";
import { toolsSection, WEB_GUIDE } from "../llm/guides";
import { runToolLoop, type LoopOutcome } from "../llm/toolLoop";
import { diffRows, diffWarnings, recipeMatches } from "./diff";
import { ResearchLog } from "./log";
import { emptyFetchIssues, webSourceIssues } from "./validate";

const ResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1),
  citations: z.array(z.string()).min(1),
  /** Optional tier-1 recipe (web/fetch) that reproduces these rows without a model. */
  compiled: ToolSourceSchema.optional(),
});

const RESULT_TOOL: ToolDefinition = {
  name: "research_result",
  description: "Return the refreshed rows (same fields and key as before), the pages you used, and, if you found one, a web/fetch recipe that reproduces them.",
  input_schema: z.toJSONSchema(ResultSchema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>,
};

function systemPrompt(tools: ToolInfo[]): string {
  return `You refresh data in Intent UI that was originally found on the web. Replay its recipe: search with its query (prefer its preferred sources), read the pages, and extract the same fields with the same key, following its instructions exactly. Then call research_result once.
Also look for a stable page or JSON API that gives these rows in a structured way. If you find one, include "compiled": a { "kind": "tool", "connection": "web", "tool": "fetch", … } source whose output (after normalize) has the same fields and key; verify it with inspect_tool first. It will be checked against your rows and, if it matches, used instead of you for future refreshes.

${WEB_GUIDE}

${toolsSection(tools.filter((tool) => tool.connection === "web"), true)}`;
}

function userPrompt(source: ResearchSource, forNewValues: boolean): string {
  return [
    forNewValues ? "This is a new subject for an existing recipe: extract the same fields for it. The previous rows are another subject's, shown only for their shape." : "",
    `Query: ${source.query}`,
    `Instructions: ${source.instructions}`,
    `Preferred sources: ${source.preferSources.join(", ") || "any reputable"}`,
    `Key: ${source.key}`,
    `Output shape (keep exactly these fields): ${JSON.stringify(Object.keys(source.data[0] ?? {}))}`,
    `Previous rows (${source.data.length}, from ${source.provenance.researchedAt}), for reference only:\n${JSON.stringify(source.data.slice(0, 20))}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Validates research_result; promotes to a tier-1 source when the compiled recipe matches. */
async function handleResult(input: unknown, source: ResearchSource, log: ResearchLog, promote: boolean): Promise<LoopOutcome<ResearchRefreshResponse>> {
  const parsed = ResultSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: describeIssues(parsed.error.issues) };
  const { rows, citations, compiled } = parsed.data;

  const provenance = { researchedAt: new Date().toISOString(), query: source.query, citations };
  const refreshed: ResearchSource = { ...source, data: rows, provenance };
  const issues = webSourceIssues([refreshed], log);
  const expected = Object.keys(source.data[0] ?? {}).sort().join(",");
  if (expected && rows.some((row) => Object.keys(row).sort().join(",") !== expected)) {
    issues.push(`keep exactly the same fields as before: ${expected}`);
  }
  if (issues.length > 0) return { ok: false, issues };

  const diff = diffRows(source.data, rows, source.key);
  const warnings = diffWarnings(source.data, diff);

  if (promote && compiled && compiled.connection === "web") {
    const candidate = { ...compiled, id: source.id, key: source.key, provenance };
    const workspace = { sources: { [source.id]: candidate } } as unknown as Workspace;
    const results = await runSources(workspace, [source.id]);
    const data = results[source.id]?.data;
    const ok = emptyFetchIssues([candidate], results).length === 0 && Array.isArray(data);
    if (ok && recipeMatches(rows, data as Record<string, unknown>[], source.key)) {
      return { ok: true, value: { source: candidate, diff, warnings, promoted: true } };
    }
  }
  return { ok: true, value: { source: refreshed, diff, warnings, promoted: false } };
}

/**
 * Replays a research source's recipe (ADR 0009 tier 2), trying to promote it to tier 1. With
 * `forNewValues` (a parameterized source's placeholders filled for new route values, ADR 0012)
 * it extracts the same shape for the new subject and never promotes (recipes stay per-route).
 */
export async function refreshResearch(env: Env, source: ResearchSource, tools: ToolInfo[], forNewValues = false): Promise<ResearchRefreshResponse> {
  const log = new ResearchLog();
  const { value } = await runToolLoop<ResearchRefreshResponse>(env, {
    system: systemPrompt(tools),
    prompt: userPrompt(source, forNewValues),
    tools: [INSPECT_TOOL, RESULT_TOOL],
    serverTools: [WEB_SEARCH_TOOL],
    onResponse: (content) => log.collect(content),
    observe: observer(log),
    handle: (call) => handleResult(call.input, source, log, !forNewValues),
  });
  return value;
}
