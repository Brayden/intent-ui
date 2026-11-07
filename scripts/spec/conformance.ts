/**
 * Runs the IAP conformance fixtures (docs/spec/conformance) against this implementation
 * (RFC 0003 §13). `npm run spec:conformance`; add `-- --update` to rewrite expectations from
 * the current output (review the diff before committing), or a fixture name to run one.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyChange, ChangeSchema, IapDocumentSchema, resolveIntent, type IapDocument } from "../../shared/api";
import { validateBlockTree } from "../../shared/catalog";
import { blockMeta, blockScope, describeIssues, documentIssues, pickRoute, renderTree, validateLayoutTree } from "../../shared/spec";
import { computePage } from "../../worker/data/views";

const DIR = resolve(import.meta.dirname, "../../docs/spec/conformance");
const update = process.argv.includes("--update");
const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

type ToolCall = { connection: string; tool: string; args?: Record<string, unknown>; result?: unknown; error?: string };
type Fixture = {
  name: string;
  level: "L1" | "L2";
  rule: string;
  kind: "render" | "validate" | "change" | "intent";
  document: unknown;
  page?: string;
  route?: Record<string, string>;
  asOf?: string;
  toolCalls?: ToolCall[];
  change?: unknown;
  intent?: { id: string; prompt: string };
  item?: unknown;
  availableTools?: string[];
  expect: Record<string, unknown>;
};

/** Stable JSON: object keys sorted, so equal values compare equal. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
}

/** Everything a host must check before accepting a document, minus host style policy (RFC 0003 §12). */
function validate(input: unknown): { document?: IapDocument; issues: string[] } {
  const parsed = IapDocumentSchema.safeParse(input);
  if (!parsed.success) return { issues: describeIssues(parsed.error.issues) };
  const { spec } = parsed.data;
  const issues = [
    ...Object.values(spec.pages).flatMap((page) => validateLayoutTree(page.layout).map((i) => `page "${page.id}": ${i}`)),
    ...Object.values(spec.blocks).flatMap((block) => validateBlockTree(block).map((i) => `block "${block.id}": ${i}`)),
    ...documentIssues(spec),
  ];
  return { document: parsed.data, issues };
}

/** Values a fixture's `expect` is compared against. */
async function actual(fixture: Fixture): Promise<Record<string, unknown>> {
  if (fixture.kind === "validate") {
    const { issues } = validate(fixture.document);
    return { valid: issues.length === 0, issues };
  }

  const { document, issues } = validate(fixture.document);
  if (!document) throw new Error(`fixture document is invalid: ${issues.join("; ")}`);
  if (issues.length > 0) throw new Error(`fixture document fails validation: ${issues.join("; ")}`);

  if (fixture.kind === "change") {
    const change = ChangeSchema.safeParse(fixture.change);
    if (!change.success) return { accepted: false, issues: describeIssues(change.error.issues) };
    if (change.data.baseVersion !== document.version) return { accepted: false, issues: [`stale baseVersion ${change.data.baseVersion}; current is ${document.version}`] };
    const applied = applyChange(document, change.data);
    const after = applied.issues.length > 0 ? applied : { ...applied, issues: validate({ ...applied.document, version: document.version + 1 }).issues };
    if (after.issues.length > 0) return { accepted: false, issues: after.issues };
    return { accepted: true, document: { ...applied.document, version: document.version + 1 } };
  }

  if (fixture.kind === "intent") {
    const resolution = resolveIntent(document, fixture.intent!, fixture.item, fixture.availableTools ? new Set(fixture.availableTools) : undefined);
    if (resolution.via === "alias") return { via: "alias", template: resolution.template.id };
    if (resolution.via === "candidates") return { via: "candidates", candidates: resolution.candidates.map((t) => t.id) };
    return { via: "materialize" };
  }

  // render
  const spec = document.spec;
  const pageId = fixture.page ?? Object.keys(spec.pages)[0]!;
  const page = spec.pages[pageId];
  if (!page) throw new Error(`no page "${pageId}"`);
  const route = pickRoute(page, fixture.route ?? {});
  const calls = fixture.toolCalls ?? [];
  const used = new Set<number>();
  const callTool = async (connection: string, tool: string, args: Record<string, unknown>) => {
    const index = calls.findIndex((c, i) => !used.has(i) && c.connection === connection && c.tool === tool && canonical(c.args ?? {}) === canonical(args));
    if (index < 0) throw new Error(`unexpected call ${connection}/${tool} ${canonical(args)}`);
    used.add(index);
    const call = calls[index]!;
    if (call.error !== undefined) throw new Error(call.error);
    return call.result;
  };
  const asOf = Date.parse(fixture.asOf ?? "2026-01-01T00:00:00Z");
  const { views, results } = await computePage(spec, pageId, route, { callTool, asOf });
  const unused = calls.filter((_, i) => !used.has(i)).map((c) => `${c.connection}/${c.tool}`);

  const render = Object.fromEntries(
    Object.entries(views).map(([id, view]) => {
      const block = spec.blocks[id]!;
      return [id, renderTree(block, blockScope(block, view, blockMeta(block, view, spec), undefined, route))];
    }),
  );
  return {
    sources: Object.fromEntries(
      Object.entries(results).map(([id, r]) => [id, r.status === "ok" ? { status: "ok", data: r.data } : { status: r.status, error: true }]),
    ),
    views: Object.fromEntries(Object.entries(views).map(([id, v]) => [id, v.error ? { data: v.data, error: true } : { data: v.data }])),
    render,
    unusedToolCalls: unused,
  };
}

/** Compares only the keys the fixture expects. Issue lists match by substring. */
function mismatches(expect: Record<string, unknown>, got: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, want] of Object.entries(expect)) {
    if (key === "issues" && Array.isArray(want)) {
      const issues = (got.issues as string[] | undefined) ?? [];
      for (const fragment of want as string[]) {
        if (!issues.some((issue) => issue.includes(fragment))) out.push(`issues: none contains "${fragment}" (got ${JSON.stringify(issues)})`);
      }
      continue;
    }
    if (canonical(want) !== canonical(got[key])) out.push(`${key}:\n    want ${canonical(want)}\n    got  ${canonical(got[key])}`);
  }
  return out;
}

const files = readdirSync(DIR).filter((file) => file.endsWith(".json")).sort();
let failed = 0;
let ran = 0;
for (const file of files) {
  const path = resolve(DIR, file);
  const fixture = JSON.parse(readFileSync(path, "utf8")) as Fixture;
  if (only.length > 0 && !only.some((name) => file.includes(name))) continue;
  ran++;
  let problems: string[];
  try {
    const got = await actual(fixture);
    if (update) {
      const next = Object.fromEntries(Object.keys(fixture.expect).map((key) => [key, key === "issues" ? fixture.expect.issues : got[key]]));
      writeFileSync(path, JSON.stringify({ ...fixture, expect: next }, null, 2) + "\n");
    }
    problems = update ? [] : mismatches(fixture.expect, got);
  } catch (error) {
    problems = [`threw: ${(error as Error).message}`];
  }
  if (problems.length === 0) console.log(`ok    ${fixture.level} ${file} — ${fixture.rule}`);
  else {
    failed++;
    console.log(`FAIL  ${fixture.level} ${file} — ${fixture.rule}\n  ${problems.join("\n  ")}`);
  }
}
console.log(`\n${ran - failed}/${ran} passed`);
if (failed > 0) process.exit(1);
