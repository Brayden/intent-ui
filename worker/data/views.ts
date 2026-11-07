import type { Block, BlockView, RouteValues, SourceResult, Workspace } from "../../shared/spec";
import { evaluate } from "./jsonata";
import { runSources, type RunOptions } from "./sources";

/**
 * Evaluates a block's view expression with its inputs bound by alias. Failed inputs are bound
 * as null so the view still renders what it can (RFC 0002 §5.6 rule 3).
 */
export async function evaluateView(
  block: Block,
  results: Record<string, SourceResult>,
  route: RouteValues = {},
  asOf: number = Date.now(),
): Promise<BlockView> {
  const inputs: BlockView["inputs"] = {};
  const bindings: Record<string, unknown> = { route };
  for (const [alias, sourceId] of Object.entries(block.inputs)) {
    const result = results[sourceId];
    inputs[alias] = { status: result?.status ?? "error", fetchedAt: result?.fetchedAt, complete: result?.complete };
    bindings[alias] = result?.status === "ok" ? result.data : null;
  }
  try {
    return { data: (await evaluate(block.view.expr, {}, bindings, { asOf })) ?? null, inputs };
  } catch (error) {
    return { data: null, inputs, error: (error as Error).message };
  }
}

/**
 * Runs every source the page's blocks need, then computes each block's view, for these route
 * values. One clock (`asOf`) is used for the whole load, so `$now()` agrees across expressions.
 */
export async function computePage(
  workspace: Workspace,
  pageId: string,
  route: RouteValues = {},
  options: RunOptions = {},
  onlyBlocks?: string[],
): Promise<{
  views: Record<string, BlockView>;
  results: Record<string, SourceResult>;
}> {
  const blocks = Object.values(workspace.blocks).filter((block) => block.page === pageId && (!onlyBlocks || onlyBlocks.includes(block.id)));
  const needed = [...new Set(blocks.flatMap((block) => Object.values(block.inputs)))];
  const asOf = options.asOf ?? Date.now();
  const results = await runSources(workspace, needed, route, { ...options, asOf });
  const entries = await Promise.all(blocks.map(async (block) => [block.id, await evaluateView(block, results, route, asOf)] as const));
  return { views: Object.fromEntries(entries), results };
}
