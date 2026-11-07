import type { ToolInfo } from "../../shared/api";
import { describeCatalog } from "../../shared/catalog";
import { pageOpeners, type RouteValues, type Workspace } from "../../shared/spec";
import {
  ACTIONS_GUIDE,
  DATA_GUIDE,
  SOURCES_GUIDE,
  VIEWS_GUIDE,
  HTML_GUIDE,
  LAYOUT_GUIDE,
  STATE_GUIDE,
  STYLE_GUIDE,
  toolsSection,
  TREE_GUIDE,
  USER_CONTROL_GUIDE,
  WEB_GUIDE,
} from "../llm/guides";

const PLANNING_GUIDE = `# Planning
- If the page is empty, design a page for the request: a header (title, short subtitle) in the layout, slots arranged for the content, and blocks with real data. Set "pageTitle".
- If the page has content, decide per request: when it's new data about things already shown (e.g. a new column for the same people), replace that block (removeBlocks + a new block with a new id, same slot and order) so it's all in one place; when it's something new, add a block. Use blockPatches for title/frame changes. Keep everything else as it is unless asked.
- Use components from the catalog first; HTML when nothing fits. Make it feel like a well-designed product page, on brand.`;

/** Compact description of the current workspace page for the model. */
export function describeWorkspace(workspace: Workspace, pageId: string, route: RouteValues = {}): string {
  const page = workspace.pages[pageId];
  const blocks = Object.values(workspace.blocks)
    .filter((block) => block.page === pageId)
    .map(({ id, slot, order, title, inputs, view, root, toolbar, nodes }) => ({ id, slot, order, title, inputs, view: view.expr, root, toolbar, nodes }));
  return [
    `Page "${pageId}" (title: ${JSON.stringify(page?.title)}) layout:\n${JSON.stringify(page?.layout)}`,
    page && Object.keys(page.params).length > 0
      ? `This page has route params (read as $route.<name>; current values for the dry run): ${JSON.stringify(page.params)} = ${JSON.stringify(route)}`
      : "",
    page
      ? `Opened from (blocks whose actions lead to this page; their items' fields can fill params via "from"): ${JSON.stringify(pageOpeners(workspace, pageId)) || "[]"}`
      : "",
    `All pages: ${JSON.stringify(Object.values(workspace.pages).map(({ id, title, params }) => ({ id, title, params: Object.keys(params) })))}`,
    `Blocks on this page:\n${blocks.length ? JSON.stringify(blocks) : "(none: the page is empty)"}`,
    `Sources:\n${Object.keys(workspace.sources).length ? JSON.stringify(Object.values(workspace.sources)) : "(none yet)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function composeSystemPrompt(tools: ToolInfo[]): string {
  return `You build and evolve the user's app in Intent UI, from what they type in its chat box. Use the user's connected tools for real data, and web_search for knowledge only the internet has. Respond with tool calls only: web_search and inspect_tool as needed, then exactly one compose_changes (or decline).

${USER_CONTROL_GUIDE}

${PLANNING_GUIDE}

${SOURCES_GUIDE}

${VIEWS_GUIDE}

${WEB_GUIDE}

# compose_changes
{ "summary", "pageTitle"?, "sources": [...], "layoutOps": [...], "newBlocks": [{ "id", "slot", "order", "title"?, "frame"?, "inputs", "view": { "expr" }, "fields"?, "root", "toolbar"?, "nodes" }], "placements"?, "blockPatches"?, "removeBlocks"?, "pageParams"?, "blockData"?: [{ "blockId", "inputs", "view": { "expr" }, "fields"? }] }.
"pageParams" replaces this page's route params; "blockData" rewires existing blocks' data (see "Dynamic pages").
Layout ops: { "op": "upsert", "id", "node" } / { "op": "remove", "id" } / { "op": "setRoot", "id" }. Every block must end up in a slot that exists.

${TREE_GUIDE}

${HTML_GUIDE}

${STYLE_GUIDE}

${LAYOUT_GUIDE}

${DATA_GUIDE}

${STATE_GUIDE}

${ACTIONS_GUIDE}

# Catalog
${describeCatalog()}

${toolsSection(tools, true)}`;
}

export function composeUserPrompt(prompt: string, workspace: Workspace, pageId: string, route: RouteValues = {}): string {
  return `Request: ${prompt}\n\n${describeWorkspace(workspace, pageId, route)}`;
}
