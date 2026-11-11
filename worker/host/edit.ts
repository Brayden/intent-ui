import { z } from "zod";
import { HostBlockSchema, type HostEditRequest, type HostEditResponse, type HostPatch, type ToolInfo } from "../../shared/api";
import { validateBlockTree } from "../../shared/catalog";
import { describeIssues, isHtmlNode, type BlockTree } from "../../shared/spec";
import { evaluate } from "../data/jsonata";
import type { Env } from "../env";
import type { ToolDefinition } from "../llm/anthropic";
import { runToolLoop, type LoopOutcome } from "../llm/toolLoop";
import { allClasses, collectClasses, styleIssues } from "../styles/collect";
import type { StyleEngine } from "../styles/engine";
import { INSPECT_TOOL, observer } from "../compose/tools";
import { ResearchLog } from "../research/log";
import { hostSourceIssues, runHostSources } from "./data";
import { hostSystemPrompt, hostUserPrompt } from "./prompt";

const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;

/*
 * One flat object: the Messages API requires a tool's input_schema to be `type: "object"` at the
 * top level, so the op-specific rules (insert needs a position and a block, replace a block) are
 * checked in the handler instead of as a union.
 */
const ChangeInputSchema = z.object({
  op: z.enum(["hide", "insert", "replace"]),
  /** insert only. */
  position: z.enum(["before", "after"]).optional(),
  /** insert and replace. */
  block: HostBlockSchema.optional(),
  summary: z.string(),
});
const DeclineInputSchema = z.object({ reason: z.string().min(1) });

export const CHANGE_TOOL: ToolDefinition = {
  name: "apply_host_change",
  description: "Apply one change to the target. op \"hide\": hide it. op \"insert\": add `block` at `position` (\"before\" or \"after\") the target. op \"replace\": show `block` instead of it. `summary` is one plain sentence for the user.",
  input_schema: jsonSchema(ChangeInputSchema),
};
export const DECLINE_TOOL: ToolDefinition = {
  name: "decline",
  description: "Decline only if the request is impossible with the target's data and the catalog.",
  input_schema: jsonSchema(DeclineInputSchema),
};

/** Host blocks can only set UI state or open external links: they have no app to navigate or tools to call. */
function actionIssues(tree: BlockTree): string[] {
  const issues: string[] = [];
  for (const [id, node] of Object.entries(tree.nodes)) {
    if (isHtmlNode(node) || !node.action) continue;
    const { name, params = {} } = node.action;
    if (name === "set" && typeof params.path === "string" && params.path.startsWith("/ui/")) continue;
    if (name === "navigate" && params.url !== undefined && params.page === undefined) continue;
    if (name === "refresh") continue;
    issues.push(`node "${id}": host blocks support only "set" (a /ui/... path), "refresh" and "navigate" with a url`);
  }
  return issues;
}

/**
 * Turns a right-click on a host element and a sentence into a validated patch: the tree must pass
 * the catalog and brand policy, its sources must run (through the gatekeeper, on the user's real
 * connections), and the view must evaluate against the element's real content and that data.
 */
export async function editHost(env: Env, request: HostEditRequest, tools: ToolInfo[], styles: StyleEngine): Promise<HostEditResponse> {
  const log = new ResearchLog();
  const handle = async (input: unknown): Promise<LoopOutcome<HostEditResponse>> => {
    const parsed = ChangeInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, issues: describeIssues(parsed.error.issues) };
    const change = parsed.data;
    if (change.op !== "hide" && !change.block) return { ok: false, issues: [`"${change.op}" needs a "block"`] };
    if (change.op === "insert" && !change.position) return { ok: false, issues: ['"insert" needs a "position": "before" or "after"'] };
    const id = request.current?.id ?? `p-${crypto.randomUUID().slice(0, 8)}`;
    const index = request.current?.index ?? request.index;
    const base = { id, page: request.page, target: request.element.id, ...(index ? { index } : {}), prompt: request.prompt };
    if (change.op === "hide") {
      const patch: HostPatch = { ...base, op: "hide" };
      return { ok: true, value: { status: "applied", patch, summary: change.summary, css: "", attempts: 0 } };
    }

    const block = change.block!;
    const issues = [...validateBlockTree(block).map((issue) => `block: ${issue}`), ...actionIssues(block), ...hostSourceIssues(block)];
    if (issues.length > 0) return { ok: false, issues };
    // Dry run: real data from the user's connections, as it'll be shown.
    const results = await runHostSources(block);
    const inputs: Record<string, unknown> = {};
    for (const [alias, result] of Object.entries(results)) {
      if (result.status !== "ok") issues.push(`input "${alias}": ${result.error ?? result.status}`);
      inputs[alias] = result.data;
    }
    if (issues.length > 0) return { ok: false, issues };
    try {
      const view = await evaluate(block.view.expr, {}, { ...inputs, host: request.element.data });
      if (view === null || typeof view !== "object" || Array.isArray(view)) issues.push("block.view must return an object (the view model), e.g. { \"rows\": $host.rows }");
    } catch (error) {
      issues.push(`block.view: ${(error as Error).message}`);
    }
    const usage = collectClasses([block]);
    issues.push(...(await styleIssues(styles, usage)));
    if (issues.length > 0) return { ok: false, issues };

    const patch: HostPatch = change.op === "insert" ? { ...base, op: "insert", position: change.position!, block } : { ...base, op: "replace", block };
    return { ok: true, value: { status: "applied", patch, summary: change.summary, css: await styles.css(allClasses(usage)), attempts: 0 } };
  };

  const { value, attempts } = await runToolLoop<HostEditResponse>(env, {
    system: hostSystemPrompt(tools),
    prompt: hostUserPrompt(request),
    tools: [INSPECT_TOOL, CHANGE_TOOL, DECLINE_TOOL],
    observe: observer(log),
    toolCatalog: tools,
    handle: async (call) => {
      if (call.name !== DECLINE_TOOL.name) return handle(call.input);
      const parsed = DeclineInputSchema.safeParse(call.input);
      return parsed.success ? { ok: true, value: { status: "declined", reason: parsed.data.reason } } : { ok: false, issues: ["decline needs a `reason`"] };
    },
  });
  return value.status === "applied" ? { ...value, attempts } : value;
}
