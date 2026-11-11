import { z } from "zod";
import type { BlockContext, GeneratePageResponse, ToolInfo } from "../../shared/api";
import { blankWorkspace, ComposeChangesSchema, describeIssues, PageParamSchema, routeFromItem, type Page, type Workspace } from "../../shared/spec";
import type { Env } from "../env";
import { WEB_SEARCH_TOOL, type ToolDefinition } from "../llm/anthropic";
import { runToolLoop, type LoopOutcome } from "../llm/toolLoop";
import { DECLINE_TOOL, handleCompose, handleDecline, INSPECT_TOOL, observer } from "../compose/tools";
import { ResearchLog } from "../research/log";
import type { StyleEngine } from "../styles/engine";
import { pageSystemPrompt, pageUserPrompt } from "./prompt";

const CreatePageInputSchema = ComposeChangesSchema.extend({
  summary: z.string().min(1).describe("One or two sentences for the user: what the page shows."),
  title: z.string().min(1).max(120),
  params: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), PageParamSchema.extend({ from: z.string() })).default({}),
});

export const CREATE_PAGE_TOOL: ToolDefinition = {
  name: "create_page",
  description: "Create the page: title, route params (filled from the clicked item), sources, layout ops, and blocks.",
  input_schema: z.toJSONSchema(CreatePageInputSchema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>,
};

/** A free page id derived from the intent id, e.g. "artist-profile", "artist-profile-2". */
function pageIdFor(intentId: string, workspace: Workspace): string {
  const base = intentId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";
  let id = base;
  for (let n = 2; workspace.pages[id]; n++) id = `${base}-${n}`;
  return id;
}

/**
 * Generates the page a deferred intent opens (ADR 0011): the model declares route params filled
 * from the clicked item, then builds the page like compose. It's validated and dry-run with the
 * clicked item's values before returning.
 */
export async function generatePage(
  env: Env,
  request: { intent: { id: string; prompt: string }; item?: unknown; from: { pageId: string; block?: BlockContext } },
  workspace: Workspace,
  tools: ToolInfo[],
  styles: StyleEngine,
): Promise<GeneratePageResponse> {
  const log = new ResearchLog();
  const pageId = pageIdFor(request.intent.id, workspace);
  const emptyLayout = blankWorkspace("").pages.home!.layout;

  const handle = async (input: unknown): Promise<LoopOutcome<GeneratePageResponse>> => {
    const parsed = CreatePageInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, issues: describeIssues(parsed.error.issues) };
    const { title, params, summary, ...changes } = parsed.data;
    const page: Page = { id: pageId, title, layout: emptyLayout, params, intent: request.intent };
    const route = routeFromItem(page, request.item);
    if (route.missing.length > 0) {
      return { ok: false, issues: route.missing.map((name) => `param "${name}": the clicked item has no value for "${params[name]?.from}"`) };
    }
    const withPage = { ...workspace, pages: { ...workspace.pages, [pageId]: page } };
    const result = await handleCompose({ summary, ...changes }, withPage, pageId, tools, styles, log, route.values);
    if (!result.ok) return result;
    if (result.value.status !== "applied") return { ok: false, issues: ["create_page must create the page"] };
    const { views, css } = result.value;
    return { ok: true, value: { status: "applied", page, changes: result.value.changes, route: route.values, views, css, summary, attempts: 0 } };
  };

  const decline = (input: unknown): LoopOutcome<GeneratePageResponse> => {
    const outcome = handleDecline(input);
    return outcome.ok && outcome.value.status === "declined" ? { ok: true, value: outcome.value } : { ok: false, issues: ["decline needs a `reason`"] };
  };

  const { value, attempts } = await runToolLoop<GeneratePageResponse>(env, {
    system: pageSystemPrompt(tools),
    prompt: pageUserPrompt(request.intent, request.item, request.from, workspace),
    tools: [INSPECT_TOOL, CREATE_PAGE_TOOL, DECLINE_TOOL],
    serverTools: [WEB_SEARCH_TOOL],
    onResponse: (content) => log.collect(content),
    observe: observer(log),
    toolCatalog: tools,
    handle: (call) => (call.name === DECLINE_TOOL.name ? decline(call.input) : handle(call.input)),
  });
  return value.status === "applied" ? { ...value, attempts } : value;
}
