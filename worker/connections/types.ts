import type { ToolInfo } from "../../shared/api";

/** Something the app can call tools on: a built-in, or a connected MCP server behind the gatekeeper (ADR 0014). */
export interface Connection {
  id: string;
  name: string;
  /** Tools the model may see and use. */
  tools: ToolInfo[];
  /** Tools the user turned off (for a clearer error than "unknown tool"). */
  disabled?: string[];
  call(tool: string, args: Record<string, unknown>): Promise<unknown>;
}
