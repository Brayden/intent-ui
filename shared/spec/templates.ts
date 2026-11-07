import { isPathRefLike } from "./values";
import { isHtmlNode, type BlockTree } from "./nodes";

const ITEM_PREFIX = "$item/";

/**
 * The key an intent is remembered under (RFC 0003 §10.1): its id and exact prompt, as a JSON
 * array (not a separator character, so any prompt text is safe).
 */
export const aliasKey = (intentId: string, prompt: string): string => JSON.stringify([intentId, prompt]);

/** What a template depends on, derived from its tree (never trusted from the model). */
export type TemplateRequirements = {
  /** Top-level `$item` fields the template reads, e.g. ["id", "name"]. */
  itemFields: string[];
  /** Tools the template calls, as "connection/tool". */
  tools: string[];
};

function collectPaths(value: unknown, into: Set<string>): void {
  if (isPathRefLike(value)) {
    if (value.path.startsWith(ITEM_PREFIX)) into.add(value.path.slice(ITEM_PREFIX.length).split("/")[0] ?? "");
    return;
  }
  if (Array.isArray(value)) value.forEach((entry) => collectPaths(entry, into));
  else if (value !== null && typeof value === "object") Object.values(value).forEach((entry) => collectPaths(entry, into));
}

/** Derives the item fields and tools a template needs, from its props and action params. */
export function templateRequirements(tree: BlockTree): TemplateRequirements {
  const itemFields = new Set<string>();
  const tools = new Set<string>();
  for (const node of Object.values(tree.nodes)) {
    if (isHtmlNode(node)) {
      collectPaths([node.text, node.src, node.alt, node.href], itemFields);
      continue;
    }
    collectPaths(node.props, itemFields);
    // Each param is its own value; the params object itself is never a binding.
    Object.values(node.action?.params ?? {}).forEach((param) => collectPaths(param, itemFields));
    const params = node.action?.params;
    if (node.action?.name === "tool" && typeof params?.connection === "string" && typeof params.tool === "string") {
      tools.add(`${params.connection}/${params.tool}`);
    }
  }
  itemFields.delete("");
  return { itemFields: [...itemFields].sort(), tools: [...tools].sort() };
}

/**
 * True if a template can render for this item: every `$item` field it reads exists on the
 * item, and every tool it calls is still available.
 */
export function isTemplateCompatible(
  requirements: TemplateRequirements,
  item: unknown,
  availableTools?: Set<string>,
): boolean {
  const fields = item !== null && typeof item === "object" ? new Set(Object.keys(item)) : new Set<string>();
  const hasFields = requirements.itemFields.every((field) => fields.has(field));
  const hasTools = !availableTools || requirements.tools.every((tool) => availableTools.has(tool));
  return hasFields && hasTools;
}
