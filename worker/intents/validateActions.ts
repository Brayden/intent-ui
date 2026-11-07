import { isHtmlNode, type BlockTree } from "../../shared/spec";
import type { ToolInfo } from "../../shared/api";

/** Checks that every action in a tree is well-formed and only references available tools. */
export function validateActions(tree: BlockTree, tools: ToolInfo[]): string[] {
  const issues: string[] = [];
  for (const [id, node] of Object.entries(tree.nodes)) {
    if (isHtmlNode(node)) continue;
    const { action } = node;
    if (!action) continue;
    const params = action.params ?? {};
    if (action.name === "tool") {
      const tool = tools.find((t) => t.connection === params.connection && t.name === params.tool);
      if (!tool) issues.push(`node "${id}": tool ${String(params.connection)} / ${String(params.tool)} is not available`);
    }
    if (action.name === "intent" && (typeof params.id !== "string" || typeof params.prompt !== "string")) {
      issues.push(`node "${id}": intent actions need string params "id" and "prompt"`);
    }
    if (action.name === "navigate") {
      if (typeof params.url === "string" && !/^https?:\/\//.test(params.url)) issues.push(`node "${id}": navigate url must be http(s)`);
      if (params.url === undefined && typeof params.page !== "string") issues.push(`node "${id}": navigate needs "page" (in this app) or "url" (external)`);
    }
    if (action.name === "intent" && params.open !== undefined && params.open !== "overlay" && params.open !== "page") {
      issues.push(`node "${id}": intent "open" must be "overlay" or "page"`);
    }
  }
  return issues;
}
