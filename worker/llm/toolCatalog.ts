import { z } from "zod";
import type { ToolInfo } from "../../shared/api";
import type { ToolDefinition, ToolUseBlock } from "./anthropic";

/*
 * How tools are presented to the model. Input schemas are the bulk of a prompt once real MCP
 * servers are connected (GitHub and Cloudflare each bring dozens of tools), and a request rarely
 * uses more than a few. Small catalogs are shown in full; large ones as a compact list, with
 * `describe_tools` to fetch the schemas the model actually needs.
 */

/** Above this many characters of schema, list tools compactly and describe on request. */
const INLINE_SCHEMA_CHARS = 6000;
/** Longest description shown in the compact list (the full one comes with describe_tools). */
const SHORT_DESCRIPTION_CHARS = 160;
/** Most tools one describe_tools call returns. */
const MAX_DESCRIBED = 10;

/** True when the catalog is too large to send with every schema inline. */
export function listsCompactly(tools: ToolInfo[]): boolean {
  return tools.reduce((size, tool) => size + JSON.stringify(tool.inputSchema).length, 0) > INLINE_SCHEMA_CHARS;
}

/** First sentence, capped, on one line. */
export function shortDescription(description: string): string {
  const oneLine = description.replace(/\s+/g, " ").trim();
  const sentence = /^(.+?[.!?])(\s|$)/.exec(oneLine)?.[1] ?? oneLine;
  return sentence.length > SHORT_DESCRIPTION_CHARS ? `${sentence.slice(0, SHORT_DESCRIPTION_CHARS - 1)}…` : sentence;
}

const DescribeInputSchema = z.object({
  tools: z
    .array(z.object({ connection: z.string(), tool: z.string() }))
    .min(1)
    .max(MAX_DESCRIBED),
});

export const DESCRIBE_TOOL: ToolDefinition = {
  name: "describe_tools",
  description: `Get the full description and input schema of up to ${MAX_DESCRIBED} tools from the Available tools list. Call it before using a tool in a source or an action, so its args match the schema.`,
  input_schema: z.toJSONSchema(DescribeInputSchema) as Record<string, unknown>,
};

/** Answers describe_tools calls from the catalog; returns null for other calls. */
export function describeTools(catalog: ToolInfo[], call: ToolUseBlock): string | null {
  if (call.name !== DESCRIBE_TOOL.name) return null;
  const parsed = DescribeInputSchema.safeParse(call.input);
  if (!parsed.success) return `Invalid describe_tools input: pass { "tools": [{ "connection", "tool" }] } (1–${MAX_DESCRIBED}).`;
  return parsed.data.tools
    .map(({ connection, tool }) => {
      const info = catalog.find((t) => t.connection === connection && t.name === tool);
      if (!info) return `## ${connection} / ${tool}\nNot an available tool.`;
      return `## ${info.connection} / ${info.name} (${info.readOnly ? "read-only" : "WRITE"}${info.destructive ? ", destructive" : ""})\n${info.description}\ninput: ${JSON.stringify(info.inputSchema)}`;
    })
    .join("\n\n");
}
