import { HttpError } from "../lib/http";
import type { Env } from "../env";

/* Minimal Anthropic Messages API client over fetch (no SDK needed in the Worker). */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
export const DEFAULT_MODEL = "claude-opus-5-5";

export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
/** Any other block (e.g. server_tool_use, web_search_tool_result): passed back unchanged. */
export type OtherBlock = { type: string; [key: string]: unknown };
export type ContentBlock = TextBlock | ToolUseBlock | OtherBlock;
export type Message = { role: "user" | "assistant"; content: string | Array<ContentBlock | ToolResultBlock> };

/** A tool we run (client tool). */
export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /**
   * Fine-grained tool streaming: the input streams as the model writes it. Without it the API
   * buffers each top-level parameter until it's complete, so a large one (e.g. all of a page's
   * blocks) arrives at once. The input isn't validated, so it may not be valid JSON.
   */
  eager_input_streaming?: boolean;
};

/** Set on a tool call whose streamed input wasn't valid JSON (fine-grained streaming only). */
export const INVALID_JSON = "INVALID_JSON";
/** A tool Anthropic runs (server tool), e.g. web search. */
export type ServerToolDefinition = { type: string; name: string; [option: string]: unknown };

/** Anthropic's web search, run server-side (ADR 0009). Results come back as content blocks. */
export const WEB_SEARCH_TOOL: ServerToolDefinition = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
  allowed_callers: ["direct"],
};

export type MessageRequest = {
  system: string;
  messages: Message[];
  tools?: Array<ToolDefinition | ServerToolDefinition>;
  tool_choice?: { type: "auto" } | { type: "any" } | { type: "tool"; name: string };
  max_tokens?: number;
};

export type MessageResponse = { content: ContentBlock[]; stop_reason: string; usage: Record<string, number> };

const CACHE = { type: "ephemeral" } as const;

/** A copy of `message` with a cache breakpoint on its last content block. */
function withBreakpoint(message: Message): Message {
  const content = typeof message.content === "string" ? [{ type: "text", text: message.content } as TextBlock] : message.content;
  if (content.length === 0) return message;
  const last = content[content.length - 1]!;
  return { ...message, content: [...content.slice(0, -1), { ...last, cache_control: CACHE } as ContentBlock] };
}

/**
 * Prompt caching (cached input costs about a tenth of fresh input, and is faster). The prefix is
 * tools → system → messages, so three breakpoints cover a whole tool loop:
 * - the system prompt: tools, guides and catalog, identical across turns and most requests;
 * - the message before the newest model turn: exactly where the previous request's cache ended,
 *   so it's read back even when that turn added many blocks (e.g. web search results);
 * - the newest message: written now, read by the next turn.
 * Breakpoints go on copies; the caller's history is never changed.
 */
function cacheable(request: MessageRequest): Omit<MessageRequest, "system"> & { system: Array<TextBlock & { cache_control: typeof CACHE }> } {
  const messages = request.messages.map((message, index, all) =>
    index === all.length - 1 || (all.length >= 3 && index === all.length - 3) ? withBreakpoint(message) : message,
  );
  return { ...request, system: [{ type: "text", text: request.system, cache_control: CACHE }], messages };
}

/** The older way to ask for fine-grained tool streaming, for APIs that don't know the per-tool field. */
const FINE_GRAINED_BETA = "fine-grained-tool-streaming-2025-05-14";

async function post(env: Env, request: MessageRequest, stream: boolean): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new HttpError(500, "ANTHROPIC_API_KEY is not set. Add it to .dev.vars and restart `npm run dev`.");
  }
  const send = (body: MessageRequest, beta?: string) =>
    fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY!,
        "anthropic-version": API_VERSION,
        ...(beta ? { "anthropic-beta": beta } : {}),
      },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL ?? DEFAULT_MODEL, max_tokens: 8192, ...cacheable(body), ...(stream ? { stream: true } : {}) }),
    });
  let response = await send(request);
  const eager = request.tools?.some((tool) => "eager_input_streaming" in tool);
  if (response.status === 400 && eager) {
    const detail = await response.clone().text();
    if (detail.includes("eager_input_streaming")) {
      const tools = request.tools?.map((tool) => {
        if (!("eager_input_streaming" in tool)) return tool;
        const { eager_input_streaming: _eager, ...rest } = tool;
        return rest;
      });
      response = await send({ ...request, tools }, FINE_GRAINED_BETA);
    }
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new HttpError(502, `Model request failed (${response.status})`, [detail.slice(0, 500)]);
  }
  return response;
}

/** Sends one Messages API request. Throws an HttpError the client can display on failure. */
export async function createMessage(env: Env, request: MessageRequest): Promise<MessageResponse> {
  const body = (await (await post(env, request, false)).json()) as MessageResponse;
  logUsage(body.usage);
  return body;
}

/** A tool call's input so far, as the model writes it (raw JSON text, possibly incomplete). */
export type ToolInputDelta = { id: string; name: string; json: string };

/**
 * Like createMessage, but streams the response: `onToolInput` sees each tool call's input text as
 * it grows, so callers can show work before the model finishes. Returns the same complete
 * message createMessage would, rebuilt from the stream's events.
 */
export async function streamMessage(env: Env, request: MessageRequest, onToolInput: (delta: ToolInputDelta) => void): Promise<MessageResponse> {
  const response = await post(env, request, true);
  if (!response.body) throw new HttpError(502, "Model stream had no body");
  const blocks: Array<Record<string, unknown>> = [];
  const json: string[] = [];
  let stopReason = "end_turn";
  const usage: Record<string, number> = {};

  const handle = (event: Record<string, any>) => {
    switch (event.type) {
      case "message_start":
        Object.assign(usage, event.message?.usage ?? {});
        break;
      case "content_block_start":
        blocks[event.index] = { ...event.content_block };
        json[event.index] = "";
        break;
      case "content_block_delta": {
        const block = blocks[event.index];
        const delta = event.delta ?? {};
        if (!block) break;
        if (delta.type === "text_delta") block.text = String(block.text ?? "") + delta.text;
        else if (delta.type === "input_json_delta") {
          json[event.index] += delta.partial_json ?? "";
          if (block.type === "tool_use") onToolInput({ id: String(block.id), name: String(block.name), json: json[event.index]! });
        } else if (delta.type === "citations_delta") block.citations = [...((block.citations as unknown[]) ?? []), delta.citation];
        else if (delta.type === "thinking_delta") block.thinking = String(block.thinking ?? "") + delta.thinking;
        else if (delta.type === "signature_delta") block.signature = delta.signature;
        break;
      }
      case "content_block_stop": {
        const block = blocks[event.index];
        // Tool inputs arrive as JSON text; an empty one means no arguments.
        if (block && (block.type === "tool_use" || block.type === "server_tool_use")) {
          const text = json[event.index] ?? "";
          if (text.trim()) {
            try {
              block.input = JSON.parse(text);
            } catch {
              // Fine-grained streaming doesn't validate; the loop sends this back for repair.
              block.input = { [INVALID_JSON]: text };
            }
          }
          else block.input ??= {};
        }
        break;
      }
      case "message_delta":
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        Object.assign(usage, event.usage ?? {});
        break;
      case "error":
        throw new HttpError(502, `Model stream failed: ${event.error?.message ?? "unknown error"}`);
    }
  };

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += value;
    // Server-sent events are separated by a blank line; each has one `data:` line here.
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) handle(JSON.parse(data));
    }
    if (done) break;
  }
  const body: MessageResponse = { content: blocks.filter(Boolean) as ContentBlock[], stop_reason: stopReason, usage };
  logUsage(usage);
  return body;
}

/** One line per request, to see what generation costs and whether the cache is hit. */
function logUsage(usage: Record<string, number> | undefined): void {
  if (!usage) return;
  const fresh = usage.input_tokens ?? 0;
  const written = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const total = fresh + written + read;
  const hit = total > 0 ? Math.round((read / total) * 100) : 0;
  console.log(`[model] input ${total} (cache read ${read}, written ${written}, fresh ${fresh}; ${hit}% cached) · output ${usage.output_tokens ?? 0}`);
}
