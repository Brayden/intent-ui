import type { ToolCallRequest } from "../../../../shared/api";

/** Splits resolved `tool` action params into the call and the UI-only success message. */
export function toToolCall(params: Record<string, unknown>): { call: ToolCallRequest; successMessage?: string } {
  const { connection, tool, successMessage, ...args } = params;
  if (typeof connection !== "string" || typeof tool !== "string") {
    throw new Error("This action is missing its connection or tool");
  }
  return {
    call: { connection, tool, args },
    successMessage: typeof successMessage === "string" ? successMessage : undefined,
  };
}
