import type { Env } from "../env";
import { HttpError } from "../lib/http";
import {
  createMessage,
  type ContentBlock,
  type Message,
  type ServerToolDefinition,
  type ToolDefinition,
  type ToolResultBlock,
  type ToolUseBlock,
} from "./anthropic";
import type { ToolInfo } from "../../shared/api";
import { DESCRIBE_TOOL, describeTools, listsCompactly } from "./toolCatalog";

const MAX_ATTEMPTS = 3;
const MAX_OBSERVATIONS = 8;
/** describe_tools calls allowed per loop (each can describe several tools). */
const MAX_DESCRIBES = 4;

/** What a tool handler decided: done (with a value) or issues to send back for repair. */
export type LoopOutcome<T> = { ok: true; value: T } | { ok: false; issues: string[] };

type ToolLoopOptions<T> = {
  system: string;
  prompt: string;
  tools: ToolDefinition[];
  /** Tools Anthropic runs (e.g. web search); their blocks are passed through unchanged. */
  serverTools?: ServerToolDefinition[];
  /** Sees every model response (e.g. to collect the URLs web search returned). */
  onResponse?: (content: ContentBlock[]) => void;
  /** Validates one tool call; return issues to have the model fix them. */
  handle: (call: ToolUseBlock) => LoopOutcome<T> | Promise<LoopOutcome<T>>;
  /**
   * Optional "look before you answer" tools (e.g. inspecting a tool's real output). Return a
   * result string to send back and keep going, or null if `call` isn't an observation.
   * Observations don't count as attempts, but are capped.
   */
  observe?: (call: ToolUseBlock) => Promise<string | null>;
  /**
   * The tools the prompt lists. When it's large enough to be listed without schemas (see
   * toolsSection), the loop offers describe_tools and answers it from this catalog.
   */
  toolCatalog?: ToolInfo[];
};

const MAX_TURNS = MAX_ATTEMPTS + MAX_OBSERVATIONS + MAX_DESCRIBES;

/**
 * Asks the model to answer with a final tool call, validates it, and feeds issues back until
 * it's valid or attempts run out. Every `tool_use` in a model message gets a `tool_result` in
 * the next one (the API requires it), including parallel calls: observations are answered with
 * their results, the first final call is handled, and any extra final calls are marked ignored.
 * Tool choice is `auto` because forced choice isn't supported by every model (e.g. Opus 5.5);
 * a message with no tool call counts as a repairable failure.
 */
export async function runToolLoop<T>(env: Env, options: ToolLoopOptions<T>): Promise<{ value: T; attempts: number }> {
  const messages: Message[] = [{ role: "user", content: options.prompt }];
  let lastIssues: string[] = [];
  let attempts = 0;
  let observations = 0;
  let describes = 0;
  const catalog = options.toolCatalog && listsCompactly(options.toolCatalog) ? options.toolCatalog : null;
  const tools = catalog ? [DESCRIBE_TOOL, ...options.tools] : options.tools;

  for (let turn = 0; turn < MAX_TURNS && attempts < MAX_ATTEMPTS; turn++) {
    const response = await createMessage(env, {
      system: options.system,
      messages,
      tools: [...tools, ...(options.serverTools ?? [])],
      tool_choice: { type: "auto" },
    });
    messages.push({ role: "assistant", content: response.content });
    options.onResponse?.(response.content);
    // A long server-tool turn (e.g. several searches) pauses; sending it back continues it.
    if (response.stop_reason === "pause_turn") continue;

    const calls = response.content.filter((block): block is ToolUseBlock => block.type === "tool_use");
    if (calls.length === 0) {
      // A turn that only ran server tools (e.g. web searches) did useful work; nudge, don't count it.
      const usedServerTools = response.content.some((block) => block.type === "server_tool_use");
      if (!usedServerTools) attempts++;
      lastIssues = ["The response did not call a tool"];
      messages.push({ role: "user", content: usedServerTools ? "Continue: use what you found and call the final tool." : "Respond only by calling one of the provided tools." });
      continue;
    }

    const results: ToolResultBlock[] = [];
    let handledFinal = false;
    for (const call of calls) {
      const described = catalog ? describeTools(catalog, call) : null;
      if (described != null) {
        describes++;
        const over = describes > MAX_DESCRIBES;
        results.push({ type: "tool_result", tool_use_id: call.id, content: over ? "Describe limit reached. Use the schemas you have." : described, is_error: over });
        continue;
      }
      const observation = await options.observe?.(call);
      if (observation != null) {
        observations++;
        const content = observations > MAX_OBSERVATIONS ? "Inspection limit reached. Respond with the final tool call now." : observation;
        results.push({ type: "tool_result", tool_use_id: call.id, content, is_error: observations > MAX_OBSERVATIONS });
        continue;
      }
      if (handledFinal) {
        results.push({ type: "tool_result", tool_use_id: call.id, content: "Ignored: only one final tool call is handled at a time.", is_error: true });
        continue;
      }
      handledFinal = true;
      attempts++;
      const known = options.tools.some((tool) => tool.name === call.name);
      const outcome: LoopOutcome<T> = known ? await options.handle(call) : { ok: false, issues: [`Unknown tool "${call.name}"`] };
      if (outcome.ok) return { value: outcome.value, attempts };
      lastIssues = outcome.issues;
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: `Fix these issues and try again:\n- ${outcome.issues.join("\n- ")}`,
        is_error: true,
      });
    }
    messages.push({ role: "user", content: results });
  }
  throw new HttpError(502, `Couldn't produce a valid result after ${attempts} attempts`, lastIssues);
}
