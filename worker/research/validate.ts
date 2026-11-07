import type { Source, SourceResult } from "../../shared/spec";
import type { ResearchLog } from "./log";

/**
 * Checks web-sourced data in a set of sources (ADR 0009). Only sources that are new or changed in
 * this request are checked against the log; existing ones were checked when they were made.
 */
export function webSourceIssues(sources: Source[], log: ResearchLog): string[] {
  const issues: string[] = [];
  for (const source of sources) {
    const isWebFetch = source.kind === "tool" && source.connection === "web";
    if (source.kind !== "research" && !isWebFetch) continue;
    const provenance = source.kind === "research" || source.kind === "tool" ? source.provenance : undefined;
    if (!provenance) {
      issues.push(`source "${source.id}": web data needs "provenance" { researchedAt, query, citations }`);
      continue;
    }
    const unseen = log.unseen(provenance.citations);
    if (unseen.length > 0) issues.push(`source "${source.id}": cite only pages you searched or fetched in this conversation; not seen: ${unseen.join(", ")}`);
    if (source.kind === "research") {
      if (source.data.length === 0) issues.push(`source "${source.id}": no rows; extract the data or decline`);
      const keys = source.data.map((row) => row[source.key]);
      if (keys.some((key) => key === undefined || key === null)) issues.push(`source "${source.id}": every row needs its key "${source.key}"`);
      if (new Set(keys.map(String)).size !== keys.length) issues.push(`source "${source.id}": keys must be unique`);
      for (const name of source.params) {
        if (!source.query.includes(`{${name}}`)) issues.push(`source "${source.id}": param "${name}" must appear in "query" as {${name}}`);
        if (!source.dataFor?.[name]) issues.push(`source "${source.id}": "dataFor" must give the "${name}" value its rows were researched for`);
      }
    }
  }
  return issues;
}

/** Tier-1 web sources must actually produce rows when run (the recipe reproduces the data). */
export function emptyFetchIssues(sources: Source[], results: Record<string, SourceResult>): string[] {
  return sources
    .filter((source) => source.kind === "tool" && source.connection === "web" && source.key)
    .filter((source) => {
      const data = results[source.id]?.data;
      return Array.isArray(data) && data.length === 0;
    })
    .map((source) => `source "${source.id}": the fetch recipe returned no rows; check the URL and selectors with inspect_tool`);
}
