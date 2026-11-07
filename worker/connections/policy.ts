import type { Access, ConnectionTool } from "../../shared/api";
import type { McpTool } from "../mcp/client";

/** The user's overrides for one tool; unset fields fall back to the defaults below. */
export type ToolPolicy = { enabled?: boolean; readOnly?: boolean };

/** Names that read without changing anything, for servers that don't annotate their tools. */
const READ_NAME = /^(get|list|search|read|fetch|find|query|describe|show|view|lookup|count|check)[_-]/i;

/**
 * The gatekeeper's view of an MCP tool (ADR 0014): read vs write from the server's annotations
 * (else a guess from its name), destructive unless the server says otherwise (MCP's default for
 * writes), and on by default only when it's a read. On a read-only connection every tool is a
 * read: the credential can't change anything (ADR 0015). The user's policy overrides all of it.
 */
export function governTool(connection: string, tool: McpTool, policy: ToolPolicy = {}, access: Access = "write"): ConnectionTool {
  const hint = tool.annotations?.readOnlyHint;
  const readOnlyBy =
    policy.readOnly !== undefined ? "user" : access === "read" ? "connection" : hint !== undefined ? "server" : "name";
  const readOnly = policy.readOnly ?? (access === "read" ? true : (hint ?? READ_NAME.test(tool.name)));
  return {
    connection,
    name: tool.name,
    title: tool.title ?? tool.annotations?.title,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema ?? { type: "object" },
    readOnly,
    destructive: !readOnly && tool.annotations?.destructiveHint !== false,
    enabled: policy.enabled ?? readOnly,
    annotated: hint !== undefined,
    readOnlyBy: readOnly ? readOnlyBy : undefined,
  };
}
