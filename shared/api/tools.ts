import { z } from "zod";

/** A tool exposed by a connection, as shown to the model and the client. */
export type ToolInfo = {
  connection: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Read-only tools never change data; everything else is a write. */
  readOnly: boolean;
  /** Writes that may delete or overwrite things; the user confirms each call (ADR 0014). */
  destructive?: boolean;
};

/** POST /api/tools/call — run one tool on a connection. */
export const ToolCallRequestSchema = z.object({
  connection: z.string(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
  /** The user confirmed a destructive tool call (otherwise the server asks first, with 409). */
  confirmed: z.boolean().default(false),
});
export type ToolCallRequest = z.input<typeof ToolCallRequestSchema>;
export type ToolCallResponse = { result: unknown };

/** Error body for every /api route. `confirm` asks the user to confirm a destructive tool call. */
export type ApiError = { error: string; details?: string[]; confirm?: { connection: string; tool: string; description: string } };
