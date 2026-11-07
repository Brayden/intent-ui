import type { BlockTree, LayoutTree } from "../../shared/spec";
import { isHtmlNode } from "../../shared/spec";
import type { StyleEngine } from "./engine";

/** Where each class is used, as "node id → classes", for readable repair messages. */
export type ClassUsage = Map<string, string[]>;

const split = (className: string | undefined) => (className ?? "").split(/\s+/).filter(Boolean);

/** Collects classes from block trees and layouts (HTML and slot nodes). */
export function collectClasses(trees: Array<BlockTree | LayoutTree>): ClassUsage {
  const usage: ClassUsage = new Map();
  for (const tree of trees) {
    for (const [id, node] of Object.entries(tree.nodes)) {
      const className = "kind" in node && (node.kind === "slot" || isHtmlNode(node)) ? node.className : undefined;
      const classes = split(className);
      if (classes.length > 0) usage.set(id, classes);
    }
  }
  return usage;
}

/** Checks every collected class against the brand policy; returns repair-ready issues. */
export async function styleIssues(engine: StyleEngine, usage: ClassUsage): Promise<string[]> {
  const failing = await engine.check([...usage.values()].flat());
  const issues: string[] = [];
  for (const [id, classes] of usage) {
    for (const token of classes) {
      const issue = failing.get(token);
      if (issue) issues.push(`node "${id}" className: ${issue}`);
    }
  }
  return issues;
}

/** All distinct classes in a usage map. */
export const allClasses = (usage: ClassUsage) => [...new Set([...usage.values()].flat())];
