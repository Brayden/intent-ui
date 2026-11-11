import { describeCatalog } from "../../shared/catalog";
import type { MaterializeRequest, Template, ToolInfo } from "../../shared/api";
import { listsCompactly } from "../llm/toolCatalog";
import { ACTIONS_GUIDE, USER_CONTROL_GUIDE, DATA_GUIDE, HTML_GUIDE, STYLE_GUIDE, STATE_GUIDE, toolsSection, TREE_GUIDE } from "../llm/guides";

/** Existing templates the model may reuse, or follow for consistency. */
function describeCandidates(candidates: Template[]): string {
  if (candidates.length === 0) return "";
  const list = candidates
    .map((t) => `## ${t.id}
Summary: ${t.summary}
First built for: "${t.prompt}"
Reads item fields: ${t.itemFields.join(", ") || "none"}
Calls tools: ${t.tools.join(", ") || "none"}
Tree: ${JSON.stringify({ root: t.root, nodes: t.nodes })}`)
    .join("\n\n");
  return `

# Existing templates
These were already built in this workspace and fit the current item. Prefer reuse: if one already serves the intent (same purpose and data, even if the wording differs, e.g. "Edit" vs "Edit profile"), call reuse_template with its id. A template that does more than asked is fine; one that does something different is not. Only emit a new template if none fits, and when you do, follow the structure, labels, and conventions of these templates so the app stays consistent.

${list}`;
}

/** System prompt for materializing a deferred intent into an overlay template. */
export function materializeSystemPrompt(tools: ToolInfo[]): string {
  return `You generate UI for Intent UI, an app that builds itself as the user uses it.
The user activated a control whose UI hasn't been built yet. Reuse an existing template if one fits (reuse_template), otherwise generate a new overlay template (emit_template). Respond only with exactly one tool call, no other text${listsCompactly(tools) ? " (describe_tools calls to read tool schemas are fine first)" : ""}.

The root must be an overlay component (Dialog); overlays have no toolbar. Keep it focused: the fewest components that fully serve the request, with clear, plain labels. Read the acted-on item with "$item/..." paths so the template works for every item of the same shape. If the request needs data or a tool that isn't available, show what you can and explain the gap with a Text node rather than faking it.

${USER_CONTROL_GUIDE}

${TREE_GUIDE}

${HTML_GUIDE}

${STYLE_GUIDE}

${DATA_GUIDE}

${STATE_GUIDE}

${ACTIONS_GUIDE}

# Catalog
${describeCatalog()}

${toolsSection(tools, true)}`;
}

/** User message: the intent, the item it acted on, and where it came from. */
export function materializeUserPrompt(request: MaterializeRequest): string {
  const { intent, item, block } = request;
  return [
    `Intent: ${intent.prompt}`,
    `Intent id: ${intent.id}`,
    `From block "${block.title ?? block.id}": ${block.summary}`,
    block.fields ? `Field definitions: ${JSON.stringify(block.fields)}` : null,
    `Block data comes from connections: ${block.connections.join(", ") || "none"}`,
    item !== undefined ? `Item ($item):\n${JSON.stringify(item, null, 2)}` : "No item: the intent was not triggered inside a list.",
  ]
    .filter(Boolean)
    .join("\n\n")
    .concat(describeCandidates(request.candidates));
}
