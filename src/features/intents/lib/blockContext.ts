import type { BlockContext } from "../../../../shared/api";
import { isHtmlNode, type Block, type Workspace } from "../../../../shared/spec";

/** A one-line structural description of a block: its component types and visible labels. */
function summarize(block: Block): string {
  const parts = Object.values(block.nodes).map((node) => {
    if (isHtmlNode(node)) return `html <${node.tag}>`;
    const label = ["header", "label", "title"].map((key) => node.props[key]).find((value) => typeof value === "string");
    return label ? `${node.type} "${label}"` : node.type;
  });
  return parts.join(", ");
}

/** What the model is told about the block an intent came from. Never includes raw data. */
export function blockContext(block: Block, workspace: Workspace): BlockContext {
  const connections = new Set<string>();
  for (const sourceId of Object.values(block.inputs)) {
    const source = workspace.sources[sourceId];
    if (source?.kind === "tool") connections.add(source.connection);
    if (source?.kind === "research") connections.add("web");
  }
  return { id: block.id, title: block.title, summary: summarize(block), fields: block.fields, connections: [...connections] };
}
