import type { Source } from "./sources";
import type { Workspace } from "./workspace";

/** JSONata functions a document may not call: they'd make replay non-deterministic (RFC 0003 §5.6). */
export const FORBIDDEN_FUNCTIONS = /\$random\s*\(/;

/** Every JSONata expression a source evaluates, with a label for messages. */
function sourceExpressions(source: Source): Array<[string, string]> {
  if (source.kind !== "tool") return [];
  const exprs: Array<[string, string]> = [[`source "${source.id}" normalize`, source.normalize]];
  if (source.when !== undefined) exprs.push([`source "${source.id}" when`, source.when]);
  for (const [key, value] of Object.entries(source.args)) {
    if (value !== null && typeof value === "object" && "expr" in value) exprs.push([`source "${source.id}" arg "${key}"`, value.expr]);
  }
  return exprs;
}

/** Source ids a source reads, directly. */
const sourceInputs = (source: Source | undefined): string[] => (source?.kind === "tool" ? Object.values(source.inputs ?? {}) : []);

/**
 * Cross-reference checks a schema can't express (RFC 0003 §12, rules 3–5): blocks sit in real
 * slots on real pages, every input resolves, the source graph has no cycles, parameterized
 * research only runs on pages that declare its params, and no expression is non-deterministic.
 * Pure; shared by the server's save path and the conformance runner.
 */
export function documentIssues(spec: Workspace): string[] {
  const issues: string[] = [];

  for (const block of Object.values(spec.blocks)) {
    const page = spec.pages[block.page];
    if (!page) issues.push(`block "${block.id}": unknown page "${block.page}"`);
    else if (page.layout.nodes[block.slot]?.kind !== "slot") issues.push(`block "${block.id}": "${block.slot}" isn't a slot on page "${block.page}"`);
    for (const [alias, sourceId] of Object.entries(block.inputs)) {
      if (!spec.sources[sourceId]) issues.push(`block "${block.id}" input "${alias}": unknown source "${sourceId}"`);
    }
    if (FORBIDDEN_FUNCTIONS.test(block.view.expr)) issues.push(`block "${block.id}" view: $random() isn't allowed`);
  }

  for (const source of Object.values(spec.sources)) {
    if (source.kind === "tool") {
      for (const [alias, sourceId] of Object.entries(source.inputs ?? {})) {
        if (!spec.sources[sourceId]) issues.push(`source "${source.id}" input "${alias}": unknown source "${sourceId}"`);
      }
    }
    for (const [label, expr] of sourceExpressions(source)) {
      if (FORBIDDEN_FUNCTIONS.test(expr)) issues.push(`${label}: $random() isn't allowed`);
    }
  }

  // Cycles: depth-first with an on-stack set.
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") return void issues.push(`source cycle: ${[...path.slice(path.indexOf(id)), id].join(" → ")}`);
    state.set(id, "visiting");
    for (const input of sourceInputs(spec.sources[id])) if (spec.sources[input]) visit(input, [...path, id]);
    state.set(id, "done");
  };
  for (const id of Object.keys(spec.sources)) visit(id, []);

  // Parameterized research reads route params, so every page that (transitively) reads it must declare them.
  const reads = (id: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(id)) return seen;
    seen.add(id);
    for (const input of sourceInputs(spec.sources[id])) reads(input, seen);
    return seen;
  };
  for (const block of Object.values(spec.blocks)) {
    const page = spec.pages[block.page];
    if (!page) continue;
    const used = new Set<string>();
    for (const sourceId of Object.values(block.inputs)) reads(sourceId, used);
    for (const sourceId of used) {
      const source = spec.sources[sourceId];
      if (source?.kind !== "research") continue;
      const missing = source.params.filter((param) => !(param in page.params));
      if (missing.length > 0) issues.push(`block "${block.id}" reads research "${source.id}", which needs page params ${missing.join(", ")} that page "${page.id}" doesn't declare`);
    }
  }

  return [...new Set(issues)];
}
