import { z } from "zod";
import { applyPageChanges, NewBlockSchema, PageChangesSchema } from "./pageChanges";
import { SourceSchema } from "./sources";
import { FieldMetaSchema, JsonSchemaSchema, PageParamSchema, type Block, type Workspace } from "./index";

/*
 * Workspace-level changes from a chat prompt (ADR 0008): new or replaced data sources, page
 * layout changes, and blocks with their own inputs and view expressions.
 */

export const ComposeBlockSchema = NewBlockSchema.extend({
  /** alias → source id. */
  inputs: z.record(z.string(), z.string()).default({}),
  /** JSONata over the inputs (bound as $alias) producing this block's view model. */
  view: z.object({ expr: z.string().min(1), schema: JsonSchemaSchema.default({}) }),
  fields: z.record(z.string(), FieldMetaSchema).optional(),
});
export type ComposeBlock = z.infer<typeof ComposeBlockSchema>;

export const ComposeChangesSchema = PageChangesSchema.omit({ newBlocks: true }).extend({
  /** Sources to add, or replace by id. */
  sources: z.array(SourceSchema).default([]),
  newBlocks: z.array(ComposeBlockSchema).default([]),
  /** Rename the page (also the workspace title for single-page workspaces). */
  pageTitle: z.string().min(1).max(120).optional(),
  /**
   * Replace the page's route params (ADR 0011/0012), e.g. to make a page show whichever artist
   * was picked. Each needs `from` (the opener's item field) and an `example` for the dry run.
   */
  pageParams: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), PageParamSchema).optional(),
  /** Rewire existing blocks' data on this page (new inputs/view/fields), e.g. to read `$route`. */
  blockData: z
    .array(
      z.object({
        blockId: z.string(),
        inputs: z.record(z.string(), z.string()),
        view: z.object({ expr: z.string().min(1), schema: JsonSchemaSchema.default({}) }),
        fields: z.record(z.string(), FieldMetaSchema).optional(),
      }),
    )
    .default([]),
});
export type ComposeChanges = z.infer<typeof ComposeChangesSchema>;

/** Applies compose changes to a workspace. Pure: the server validates, the client applies the same. */
export function applyComposeChanges(workspace: Workspace, pageId: string, changes: ComposeChanges): { workspace: Workspace; issues: string[] } {
  const page = workspace.pages[pageId];
  if (!page) return { workspace, issues: [`Unknown page "${pageId}"`] };

  const onPage = Object.values(workspace.blocks).filter((block) => block.page === pageId);
  const result = applyPageChanges(page.layout, onPage, { ...changes, newBlocks: changes.newBlocks });
  const issues = [...result.issues];

  const sources = { ...workspace.sources };
  for (const source of changes.sources) sources[source.id] = source;

  const blocks = { ...workspace.blocks };
  for (const placed of result.placements) {
    const existing = blocks[placed.id];
    if (existing) blocks[placed.id] = { ...existing, slot: placed.slot, order: placed.order };
  }
  for (const patch of changes.blockPatches) {
    const existing = blocks[patch.blockId];
    if (!existing) continue;
    const title = patch.title === undefined ? existing.title : (patch.title ?? undefined);
    blocks[patch.blockId] = { ...existing, title, frame: { ...existing.frame, ...patch.frame } };
  }
  for (const id of changes.removeBlocks) delete blocks[id];
  for (const added of changes.newBlocks) {
    const block: Block = { ...added, page: pageId, ui: {} };
    blocks[added.id] = block;
  }
  for (const data of changes.blockData) {
    const existing = blocks[data.blockId];
    if (!existing || existing.page !== pageId) {
      issues.push(`blockData: no block "${data.blockId}" on this page`);
      continue;
    }
    blocks[data.blockId] = { ...existing, inputs: data.inputs, view: data.view, fields: data.fields ?? existing.fields };
  }

  for (const block of Object.values(blocks)) {
    for (const [alias, sourceId] of Object.entries(block.inputs)) {
      if (!sources[sourceId]) issues.push(`block "${block.id}" input "${alias}": unknown source "${sourceId}"`);
    }
  }
  for (const source of Object.values(sources)) {
    if (source.kind !== "tool") continue;
    for (const [alias, sourceId] of Object.entries(source.inputs ?? {})) {
      if (!sources[sourceId]) issues.push(`source "${source.id}" input "${alias}": unknown source "${sourceId}"`);
    }
  }

  const pages = {
    ...workspace.pages,
    [pageId]: { ...page, layout: result.layout, title: changes.pageTitle ?? page.title, params: changes.pageParams ?? page.params },
  };
  return { workspace: { ...workspace, pages, blocks, sources }, issues };
}

/** Where a block's data comes from: its inputs, view expression, and field definitions. */
export const BlockDataSchema = z.object({
  inputs: z.record(z.string(), z.string()),
  view: z.object({ expr: z.string().min(1), schema: JsonSchemaSchema.default({}) }),
  fields: z.record(z.string(), FieldMetaSchema).optional(),
});
export type BlockData = z.infer<typeof BlockDataSchema>;

/**
 * Rewires one block's data (and adds/replaces sources), e.g. "make this table show today's top
 * songs" (ADR 0004 addendum). Pure: the server validates, the client applies the same.
 */
export function applyBlockData(
  workspace: Workspace,
  blockId: string,
  data: BlockData | undefined,
  sources: z.infer<typeof SourceSchema>[],
): { workspace: Workspace; issues: string[] } {
  const block = workspace.blocks[blockId];
  if (!block) return { workspace, issues: [`Unknown block "${blockId}"`] };
  const nextSources = { ...workspace.sources };
  for (const source of sources) nextSources[source.id] = source;
  const nextBlock: Block = data ? { ...block, inputs: data.inputs, view: data.view, fields: data.fields ?? block.fields } : block;
  const issues = Object.entries(nextBlock.inputs)
    .filter(([, sourceId]) => !nextSources[sourceId])
    .map(([alias, sourceId]) => `block "${blockId}" input "${alias}": unknown source "${sourceId}"`);
  return { workspace: { ...workspace, sources: nextSources, blocks: { ...workspace.blocks, [blockId]: nextBlock } }, issues };
}
