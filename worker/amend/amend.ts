import type { AmendRequest, AmendResponse, ToolInfo } from "../../shared/api";
import { WorkspaceSchema } from "../../shared/spec";
import { INSPECT_TOOL, observer } from "../compose/tools";
import type { Env } from "../env";
import { HttpError } from "../lib/http";
import { WEB_SEARCH_TOOL } from "../llm/anthropic";
import { runToolLoop } from "../llm/toolLoop";
import { ResearchLog } from "../research/log";
import type { StyleEngine } from "../styles/engine";
import { amendSystemPrompt, amendUserPrompt } from "./prompt";
import { APPLY_TOOL, DECLINE_TOOL, handleApply, handleDecline } from "./tools";

/**
 * Turns a pointed prompt into validated changes: ops on the target's tree, page changes, and,
 * for page blocks, where the block's data comes from (sources incl. web research, inputs, view).
 * Everything is validated, and data changes are dry-run, before anything is returned.
 */
export async function amend(env: Env, request: AmendRequest, tools: ToolInfo[], styles: StyleEngine): Promise<AmendResponse> {
  const { nodeId } = request.target;
  const inTree = request.kind === "page" ? request.page?.layout.nodes : request.tree?.nodes;
  if (nodeId && !inTree?.[nodeId]) throw new HttpError(400, `Target "${nodeId}" isn't in the ${request.kind === "page" ? "layout" : "tree"}`);

  const parsed = request.spec === undefined ? undefined : WorkspaceSchema.safeParse(request.spec);
  if (parsed && !parsed.success) throw new HttpError(400, "Invalid workspace spec");
  const workspace = parsed?.data;
  const log = new ResearchLog();

  const canChangeData = Boolean(workspace) && request.kind === "block";
  const { value, attempts } = await runToolLoop<AmendResponse>(env, {
    system: amendSystemPrompt(tools, canChangeData),
    prompt: amendUserPrompt(request, workspace),
    tools: [INSPECT_TOOL, APPLY_TOOL, DECLINE_TOOL],
    serverTools: [WEB_SEARCH_TOOL],
    onResponse: (content) => log.collect(content),
    observe: observer(log),
    // Schemas are only listed when the edit can change data (see amendSystemPrompt).
    toolCatalog: canChangeData ? tools : undefined,
    handle: (call) =>
      call.name === DECLINE_TOOL.name ? handleDecline(call.input) : handleApply(call.input, request, { tools, styles, workspace, log }),
  });
  return value.status === "applied" ? { ...value, attempts } : value;
}
