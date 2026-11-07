import type { Workspace } from "../../shared/spec";
import { findTool } from "../connections/registry";

/** Tool sources must use existing, read-only tools (writes never run as data sources). */
export function sourceIssues(workspace: Workspace): string[] {
  const issues: string[] = [];
  for (const source of Object.values(workspace.sources)) {
    if (source.kind !== "tool") continue;
    try {
      const { tool } = findTool(source.connection, source.tool);
      if (!tool.readOnly) issues.push(`source "${source.id}": ${source.tool} is a write tool; data sources must be read-only`);
    } catch (error) {
      issues.push(`source "${source.id}": ${(error as Error).message}`);
    }
  }
  return issues;
}
