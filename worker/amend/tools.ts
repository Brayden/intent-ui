import { z } from "zod";
import type { AmendRequest, AmendResponse, ToolInfo } from "../../shared/api";
import { lintDialogActions, validateBlockTree } from "../../shared/catalog";
import {
  applyBlockData,
  applyBlockOps,
  applyPageChanges,
  BlockDataSchema,
  BlockOpSchema,
  SourceSchema,
  type BlockData,
  type BlockView,
  type Source,
  type Workspace,
  describeIssues,
  hasPageChanges,
  PageChangesSchema,
  type BlockOp,
  type PageChanges, pickRoute, routeWriteIssues, dryRunRoute, PageParamSchema, type PageParam } from "../../shared/spec";
import type { ToolDefinition } from "../llm/anthropic";
import type { LoopOutcome } from "../llm/toolLoop";
import { sourceIssues } from "../data/checkSources";
import { computePage } from "../data/views";
import { validateActions } from "../intents/validateActions";
import type { ResearchLog } from "../research/log";
import { emptyFetchIssues, webSourceIssues } from "../research/validate";
import { allClasses, collectClasses, styleIssues, type ClassUsage } from "../styles/collect";
import type { StyleEngine } from "../styles/engine";

const ApplyInputSchema = z.object({
  summary: z.string().min(1).describe("One short sentence describing the change, shown to the user."),
  ops: z.array(BlockOpSchema).default([]).describe("Edits to the target block's tree."),
  page: PageChangesSchema.optional().describe("Optional page-level changes: layout ops, block placements, new blocks."),
  sources: z.array(SourceSchema).default([]).describe("Data sources to add or replace (by id), incl. web sources."),
  data: BlockDataSchema.optional().describe("The target block's new data: inputs (alias → source id), view { expr }, fields."),
  pageParams: z
    .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), PageParamSchema)
    .optional()
    .describe('Replace the page\'s route params (page blocks only), e.g. add { "q": { "description": "Search query", "optional": true } } for a search box.'),
});

/** What a pointed edit is validated against: available tools, styles, the workspace, and web research. */
export type ApplyContext = { tools: ToolInfo[]; styles: StyleEngine; workspace?: Workspace; log: ResearchLog };
const DeclineInputSchema = z.object({
  reason: z.string().min(1).describe("Plain-language explanation of why, and what would make it possible."),
});

const jsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;

export const APPLY_TOOL: ToolDefinition = {
  name: "apply_changes",
  description: "Apply the change: ops on the target block's tree, and optionally page changes (layout, placements, new blocks).",
  input_schema: jsonSchema(ApplyInputSchema),
};

export const DECLINE_TOOL: ToolDefinition = {
  name: "decline",
  description: "Decline when the change can't be made with the available data, components, or tools.",
  input_schema: jsonSchema(DeclineInputSchema),
};

const zodIssues = (error: z.ZodError) => describeIssues(error.issues);

/**
 * Validates block ops against the resulting tree. Edits may touch any node of the target's
 * block (e.g. hiding sibling columns); the prompt asks for minimal changes and the result
 * must be a valid tree.
 */
function blockIssues(request: AmendRequest, ops: BlockOp[], tools: ToolInfo[]): string[] {
  if (ops.length === 0) return [];
  if (!request.tree) return ["This target is part of the page layout: use page changes, not block ops"];
  const next = applyBlockOps(request.tree, ops);
  const routeIssues = request.page ? routeWriteIssues(next, request.page.params) : [];
  const changed = new Set(ops.flatMap((op) => (op.op === "upsert" ? [op.id] : [])));
  return [...validateBlockTree(next, { overlay: request.kind === "overlay" }), ...lintDialogActions(next, changed), ...validateActions(next, tools), ...routeIssues];
}

/** Validates page changes: allowed only for page blocks; layout, placements, and new blocks. */
function pageIssues(request: AmendRequest, page: PageChanges, tools: ToolInfo[]): string[] {
  if (!request.page) return ["Page changes aren't possible here (overlays can't change the page)"];
  const { issues } = applyPageChanges(request.page.layout, request.page.blocks, page);
  for (const block of page.newBlocks) {
    for (const issue of [...validateBlockTree(block), ...lintDialogActions(block), ...validateActions(block, tools), ...routeWriteIssues(block, request.page.params)]) {
      issues.push(`new block "${block.id}": ${issue}`);
    }
  }
  return issues;
}

/** Classes in everything the change touches: the resulting block tree, layout, and new blocks. */
function changedClasses(request: AmendRequest, ops: BlockOp[], page: PageChanges | undefined): ClassUsage {
  const trees = [];
  if (request.tree && ops.length > 0) trees.push(applyBlockOps(request.tree, ops));
  if (page && request.page) {
    if (page.layoutOps.length > 0) trees.push(applyPageChanges(request.page.layout, request.page.blocks, page).layout);
    trees.push(...page.newBlocks);
  }
  return collectClasses(trees);
}

/** Validates apply_changes (structure, actions, brand policy) and returns the response with its CSS. */
/**
 * Validates and dry-runs a data change on the target block: sources (read-only tools, citations),
 * the block's new inputs/view, then actually fetches and evaluates it. Returns views, or issues.
 */
async function dataChange(
  request: AmendRequest,
  ctx: ApplyContext,
  sources: Source[],
  data: BlockData | undefined,
  pageParams: Record<string, PageParam> | undefined,
): Promise<{ issues: string[]; views?: Record<string, BlockView> }> {
  const blockId = request.block?.id;
  if (!ctx.workspace || request.kind !== "block" || !blockId) return { issues: ["Data can only be changed for blocks on the page"] };
  const applied = applyBlockData(ctx.workspace, blockId, data, sources);
  const issues = [...applied.issues, ...sourceIssues(applied.workspace), ...webSourceIssues(sources, ctx.log)];
  if (issues.length > 0) return { issues };

  const block = applied.workspace.blocks[blockId];
  if (!block) return { issues: [`Unknown block "${blockId}"`] };
  const original = applied.workspace.pages[block.page];
  const page = original && pageParams ? { ...original, params: pageParams } : original;
  const next = page ? { ...applied.workspace, pages: { ...applied.workspace.pages, [page.id]: page } } : applied.workspace;
  const route = page ? dryRunRoute(page, pickRoute(page, request.route)).values : {};
  const { views, results } = await computePage(next, block.page, route);
  const used = new Set(Object.values(block.inputs));
  for (const [id, result] of Object.entries(results)) {
    if (used.has(id) && result.status === "error") issues.push(`source "${id}" failed: ${result.error}`);
  }
  if (views[blockId]?.error) issues.push(`the block's view failed: ${views[blockId]?.error}`);
  issues.push(...emptyFetchIssues(sources, results));
  return issues.length > 0 ? { issues } : { issues: [], views };
}

export async function handleApply(input: unknown, request: AmendRequest, ctx: ApplyContext): Promise<LoopOutcome<AmendResponse>> {
  const parsed = ApplyInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) };
  const { ops, page, summary, sources, data, pageParams } = parsed.data;
  const hasPage = Boolean(page && hasPageChanges(page));
  const hasData = sources.length > 0 || data !== undefined;
  if (ops.length === 0 && !hasPage && !hasData && !pageParams) return { ok: false, issues: ["apply_changes made no changes"] };
  if (pageParams && (request.kind !== "block" || !request.page)) return { ok: false, issues: ["pageParams can only change for blocks on a page"] };

  // Checks see the page's params as they'll be after this change.
  const checked = pageParams && request.page ? { ...request, page: { ...request.page, params: Object.keys(pageParams) } } : request;
  const changes = hasPage ? page : undefined;
  const issues = [...blockIssues(checked, ops, ctx.tools), ...(changes ? pageIssues(checked, changes, ctx.tools) : [])];
  if (issues.length > 0) return { ok: false, issues };

  const usage = changedClasses(request, ops, changes);
  const brand = await styleIssues(ctx.styles, usage);
  if (brand.length > 0) return { ok: false, issues: brand };

  const dry = hasData ? await dataChange(request, ctx, sources, data, pageParams) : { issues: [] };
  if (dry.issues.length > 0) return { ok: false, issues: dry.issues };

  const css = await ctx.styles.css(allClasses(usage));
  return {
    ok: true,
    value: {
      status: "applied",
      ops,
      page: changes,
      summary,
      attempts: 0,
      css,
      ...(hasData ? { data: { sources, block: data }, views: dry.views } : {}),
      ...(pageParams ? { pageParams } : {}),
    },
  };
}

export function handleDecline(input: unknown): LoopOutcome<AmendResponse> {
  const parsed = DeclineInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: ["decline needs a `reason` string"] };
  return { ok: true, value: { status: "declined", reason: parsed.data.reason } };
}
