import { ToolCallRequestSchema, type ApiError, type ToolCallResponse } from "../../shared/api";
import { findTool } from "../connections/registry";
import { readJson } from "../lib/http";

/**
 * POST /api/tools/call — runs one tool a user action asked for (writes happen only here, from a
 * click). Destructive tools need `confirmed: true`; until then this answers 409 with what to
 * confirm (ADR 0014).
 */
export async function handleToolCall(request: Request): Promise<Response> {
  const { connection: connectionId, tool: toolName, args, confirmed } = await readJson(request, ToolCallRequestSchema);
  const { connection, tool } = findTool(connectionId, toolName);
  if (tool.destructive && !confirmed) {
    const body: ApiError = {
      error: `Confirm before running ${toolName} on ${connection.name}`,
      confirm: { connection: connection.name, tool: toolName, description: tool.description },
    };
    return Response.json(body, { status: 409 });
  }
  const body: ToolCallResponse = { result: await connection.call(toolName, args) };
  return Response.json(body);
}
