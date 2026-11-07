import { z } from "zod";
import {
  aliasKey,
  applyBlockOps,
  applyLayoutOps,
  BlockOpSchema,
  BlockSchema,
  isTemplateCompatible,
  LayoutOpSchema,
  PageSchema,
  SourceSchema,
  templateRequirements,
  WorkspaceSchema,
  type Workspace,
} from "../spec";
import { TemplateSchema, type Template } from "./intents";

/*
 * The portable IAP document and change format (RFC 0003 §3 and §11.3). A host stores these
 * however it likes; this is the shape it imports, exports and exchanges.
 */

/** The IAP draft this implementation speaks. */
export const IAP_VERSION = "0.1";

/** A whole document: the spec, its version, and its template library. */
export const IapDocumentSchema = z.object({
  iap: z.literal(IAP_VERSION),
  /** Increases by one with every accepted change. */
  version: z.number().int().nonnegative(),
  spec: WorkspaceSchema,
  /** Materialized intents (RFC 0003 §10.2). */
  templates: z.array(TemplateSchema).default([]),
  /** aliasKey(intent id, prompt) → template id. */
  aliases: z.record(z.string(), z.string()).default({}),
});
export type IapDocument = z.infer<typeof IapDocumentSchema>;

const IntentRefSchema = z.object({ id: z.string().min(1), prompt: z.string().min(1) });

/** One edit. Ops apply in order; each sees the result of the ones before it. */
export const ChangeOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("putPage"), page: PageSchema }),
  z.object({ op: z.literal("removePage"), id: z.string() }),
  z.object({ op: z.literal("layoutOps"), page: z.string(), ops: z.array(LayoutOpSchema) }),
  z.object({ op: z.literal("putBlock"), block: BlockSchema }),
  z.object({ op: z.literal("removeBlock"), id: z.string() }),
  z.object({ op: z.literal("blockOps"), block: z.string(), ops: z.array(BlockOpSchema) }),
  z.object({ op: z.literal("putSource"), source: SourceSchema }),
  z.object({ op: z.literal("removeSource"), id: z.string() }),
  z.object({ op: z.literal("putTemplate"), template: TemplateSchema }),
  z.object({ op: z.literal("removeTemplate"), id: z.string() }),
  /** Points an intent at a template, or forgets it (null) so the next click materializes again. */
  z.object({ op: z.literal("setAlias"), intent: IntentRefSchema, template: z.string().nullable() }),
]);
export type ChangeOp = z.infer<typeof ChangeOpSchema>;

/** A validated edit to a document (RFC 0003 §11.3): the only way a document changes. */
export const ChangeSchema = z.object({
  /** The document version the change was made against; stale changes are rejected. */
  baseVersion: z.number().int().nonnegative(),
  /** Shown in history, e.g. "Added a details dialog". */
  summary: z.string().min(1).max(300),
  ops: z.array(ChangeOpSchema).min(1),
});
export type Change = z.infer<typeof ChangeSchema>;

/** What a change did to the template library, for hosts that store it separately. */
export type LibraryWrites = {
  putTemplates: Template[];
  removeTemplates: string[];
  aliases: Record<string, string | null>;
};

/**
 * Applies a change's ops to a document. Pure: references an op can't apply are reported as
 * issues (the change must then be rejected), and the version is left to the host, which bumps
 * it only when it accepts the change after full validation (RFC 0003 §12).
 */
export function applyChange(document: IapDocument, change: Change): { document: IapDocument; issues: string[]; library: LibraryWrites } {
  let spec: Workspace = document.spec;
  const templates = new Map(document.templates.map((template) => [template.id, template]));
  const aliases = { ...document.aliases };
  const library: LibraryWrites = { putTemplates: [], removeTemplates: [], aliases: {} };
  const issues: string[] = [];

  change.ops.forEach((op, index) => {
    const at = `ops[${index}] ${op.op}`;
    switch (op.op) {
      case "putPage":
        spec = { ...spec, pages: { ...spec.pages, [op.page.id]: op.page } };
        break;
      case "removePage": {
        if (!spec.pages[op.id]) return void issues.push(`${at}: no page "${op.id}"`);
        const { [op.id]: _removed, ...pages } = spec.pages;
        const blocks = Object.fromEntries(Object.entries(spec.blocks).filter(([, block]) => block.page !== op.id));
        spec = { ...spec, pages, blocks };
        break;
      }
      case "layoutOps": {
        const page = spec.pages[op.page];
        if (!page) return void issues.push(`${at}: no page "${op.page}"`);
        spec = { ...spec, pages: { ...spec.pages, [op.page]: { ...page, layout: applyLayoutOps(page.layout, op.ops) } } };
        break;
      }
      case "putBlock":
        spec = { ...spec, blocks: { ...spec.blocks, [op.block.id]: op.block } };
        break;
      case "removeBlock": {
        if (!spec.blocks[op.id]) return void issues.push(`${at}: no block "${op.id}"`);
        const { [op.id]: _removed, ...blocks } = spec.blocks;
        spec = { ...spec, blocks };
        break;
      }
      case "blockOps": {
        const block = spec.blocks[op.block];
        if (!block) return void issues.push(`${at}: no block "${op.block}"`);
        spec = { ...spec, blocks: { ...spec.blocks, [op.block]: { ...block, ...applyBlockOps(block, op.ops) } } };
        break;
      }
      case "putSource":
        spec = { ...spec, sources: { ...spec.sources, [op.source.id]: op.source } };
        break;
      case "removeSource": {
        if (!spec.sources[op.id]) return void issues.push(`${at}: no source "${op.id}"`);
        const { [op.id]: _removed, ...sources } = spec.sources;
        spec = { ...spec, sources };
        break;
      }
      case "putTemplate": {
        // What a template needs is derived from its tree, never taken from the writer (RFC 0003 §10.2).
        const template = { ...op.template, ...templateRequirements(op.template) };
        templates.set(template.id, template);
        library.putTemplates = [...library.putTemplates.filter((t) => t.id !== template.id), template];
        break;
      }
      case "removeTemplate": {
        if (!templates.has(op.id)) return void issues.push(`${at}: no template "${op.id}"`);
        templates.delete(op.id);
        library.putTemplates = library.putTemplates.filter((t) => t.id !== op.id);
        library.removeTemplates.push(op.id);
        for (const [key, id] of Object.entries(aliases)) {
          if (id !== op.id) continue;
          delete aliases[key];
          library.aliases[key] = null;
        }
        break;
      }
      case "setAlias": {
        const key = aliasKey(op.intent.id, op.intent.prompt);
        if (op.template === null) delete aliases[key];
        else if (!templates.has(op.template)) return void issues.push(`${at}: no template "${op.template}"`);
        else aliases[key] = op.template;
        library.aliases[key] = op.template;
        break;
      }
    }
  });

  return { document: { ...document, spec, templates: [...templates.values()], aliases }, issues, library };
}

/** How an intent resolved without generating, or why it needs the materializer. */
export type IntentResolution =
  | { via: "alias"; template: Template }
  | { via: "candidates"; candidates: Template[] }
  | { via: "materialize" };

/**
 * The deterministic part of invoking an intent (RFC 0003 §10.1, steps 1–3). No model is involved:
 * an alias whose template still fits the item renders it; otherwise compatible templates (newest
 * first) are offered to the materializer to reuse; with none, it generates.
 */
export function resolveIntent(
  library: Pick<IapDocument, "templates" | "aliases">,
  intent: { id: string; prompt: string },
  item: unknown,
  availableTools?: Set<string>,
  maxCandidates = 12,
): IntentResolution {
  const aliased = library.aliases[aliasKey(intent.id, intent.prompt)];
  const template = aliased ? library.templates.find((t) => t.id === aliased) : undefined;
  if (template && isTemplateCompatible(template, item, availableTools)) return { via: "alias", template };
  const candidates = [...library.templates]
    .reverse()
    .filter((t) => isTemplateCompatible(t, item, availableTools))
    .slice(0, maxCandidates);
  return candidates.length > 0 ? { via: "candidates", candidates } : { via: "materialize" };
}
