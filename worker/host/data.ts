import type { HostBlock } from "../../shared/api";
import type { SourceResult, Workspace } from "../../shared/spec";
import { runSources } from "../data/sources";

/** A host block's sources as a minimal workspace, so the normal source runner (and gatekeeper) applies. */
function asWorkspace(block: HostBlock): Workspace {
  return { specVersion: 0, catalogVersion: "kumo@2.17", pages: {}, blocks: {}, sources: Object.fromEntries(block.sources.map((source) => [source.id, source])) };
}

/** Runs the sources a host block reads; results keyed by input alias. */
export async function runHostSources(block: HostBlock): Promise<Record<string, SourceResult>> {
  const entries = Object.entries(block.inputs);
  if (entries.length === 0) return {};
  const results = await runSources(asWorkspace(block), [...new Set(entries.map(([, id]) => id))]);
  return Object.fromEntries(entries.map(([alias, id]) => [alias, results[id]!]));
}

/** Problems with how a host block declares data, before anything runs. */
export function hostSourceIssues(block: HostBlock): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const source of block.sources) {
    if (ids.has(source.id)) issues.push(`sources: duplicate id "${source.id}"`);
    ids.add(source.id);
    if (source.kind === "research") issues.push(`source "${source.id}": host blocks support tool and local sources (use a web/fetch tool source for the web)`);
  }
  for (const source of block.sources) {
    if (source.kind !== "tool") continue;
    for (const [alias, id] of Object.entries(source.inputs ?? {})) if (!ids.has(id)) issues.push(`source "${source.id}" input "${alias}": unknown source "${id}"`);
  }
  for (const [alias, id] of Object.entries(block.inputs)) {
    if (alias === "host") issues.push(`inputs: "host" is reserved for the target's content`);
    if (!ids.has(id)) issues.push(`inputs.${alias}: unknown source "${id}" (declare it in "sources")`);
  }
  return issues;
}
