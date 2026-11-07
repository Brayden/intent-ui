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
export type ToolDefinition = { name: string; description: string; input_schema: Record<string, unknown> };
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

/** Sends one Messages API request. Throws an HttpError the client can display on failure. */
export async function createMessage(env: Env, request: MessageRequest): Promise<MessageResponse> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new HttpError(500, "ANTHROPIC_API_KEY is not set. Add it to .dev.vars and restart `npm run dev`.");
  }
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL ?? DEFAULT_MODEL, max_tokens: 8192, ...request }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new HttpError(502, `Model request failed (${response.status})`, [detail.slice(0, 500)]);
  }
  return response.json();
}
