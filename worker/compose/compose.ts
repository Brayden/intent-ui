import type { ComposeResponse, ToolInfo } from "../../shared/api";
import type { RouteValues, Workspace } from "../../shared/spec";
import type { Env } from "../env";
import { runToolLoop } from "../llm/toolLoop";
import type { StyleEngine } from "../styles/engine";
import { composeSystemPrompt, composeUserPrompt } from "./prompt";
import { WEB_SEARCH_TOOL } from "../llm/anthropic";
import { ResearchLog } from "../research/log";
import { COMPOSE_TOOL, DECLINE_TOOL, handleCompose, handleDecline, INSPECT_TOOL, observer } from "./tools";

/**
 * Builds or changes a page from a chat prompt (ADR 0008): the model may inspect read-only tools,
 * then proposes sources, layout, and blocks, which are validated and dry-run before returning.
 */
export async function compose(
  env: Env,
  prompt: string,
  workspace: Workspace,
  pageId: string,
  tools: ToolInfo[],
  styles: StyleEngine,
  route: RouteValues = {},
): Promise<ComposeResponse> {
  const log = new ResearchLog();
  const { value, attempts } = await runToolLoop<ComposeResponse>(env, {
    system: composeSystemPrompt(tools),
    prompt: composeUserPrompt(prompt, workspace, pageId, route),
    tools: [INSPECT_TOOL, COMPOSE_TOOL, DECLINE_TOOL],
    serverTools: [WEB_SEARCH_TOOL],
    onResponse: (content) => log.collect(content),
    observe: observer(log),
    handle: (call) =>
      call.name === DECLINE_TOOL.name ? handleDecline(call.input) : handleCompose(call.input, workspace, pageId, tools, styles, log, route),
  });
  return value.status === "applied" ? { ...value, attempts } : value;
}
