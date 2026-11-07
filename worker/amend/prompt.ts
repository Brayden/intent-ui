import type { AmendRequest, ToolInfo } from "../../shared/api";
import type { Workspace } from "../../shared/spec";
import { describeCatalog } from "../../shared/catalog";
import {
  ACTIONS_GUIDE,
  DATA_GUIDE,
  HTML_GUIDE,
  LAYOUT_GUIDE,
  SOURCES_GUIDE,
  STATE_GUIDE,
  STYLE_GUIDE,
  toolsSection,
  TREE_GUIDE,
  USER_CONTROL_GUIDE,
  VIEWS_GUIDE,
  WEB_GUIDE,
} from "../llm/guides";

const DATA_CHANGE_GUIDE = `# Changing where a block's data comes from
You can change what data the target block shows, not just how it looks. When the request needs different or more data ("show today's top 25 songs", "add their Linear issues", "only last week's PRs"), change the data:
- "sources": add or replace data sources (by id), including web sources (use web_search, then a web/fetch or research source) and connected tools (use inspect_tool to learn their output first).
- "data": the block's new { "inputs": { alias: sourceId }, "view": { "expr" }, "fields"? }. The view's output must fit the block's components (or change them with ops in the same call), e.g. keep "/rows" for a table.
- Keep sources other blocks still use; add new ones with new ids instead of breaking them.
The server fetches the data and evaluates the view before accepting; failures come back to you to fix.`;

/** System prompt for pointed edits (RFC 0001 §4.3, §8.2; ADR 0004). */
export function amendSystemPrompt(tools: ToolInfo[], canChangeData: boolean): string {
  const dataSections = canChangeData ? `${DATA_CHANGE_GUIDE}\n\n${SOURCES_GUIDE}\n\n${VIEWS_GUIDE}\n\n${WEB_GUIDE}\n\n` : "";
  return `You edit existing UI in Intent UI, an app that builds itself around what its user asks for.
The user right-clicked something (the target: a component, part of a block's chrome, or part of the page layout) and described a change. Users can control every aspect of their app. The target tells you WHAT they're talking about, not necessarily WHERE new UI must go: put things where a good product designer would (e.g. a table-level control goes in the block toolbar, not inside a column). Be resourceful: combine components, add containers, toolbars, popovers, and UI state to deliver what was asked. Respond with tool calls only: web_search and inspect_tool as needed, then exactly one apply_changes (or decline).

# Editing with ops
- { "op": "upsert", "id", "node" }: add or replace a node.
- { "op": "remove", "id" }: remove a node and its subtree (also dropped from its parent).
- { "op": "setRoot", "id" }: point the body at another node, e.g. a new Stack whose children include the old root.
- { "op": "setToolbar", "id" | null }: set or clear the block's header toolbar root.
- To add a child, upsert the new node and upsert its parent with the id added to "children".
- Change whatever the request needs in this block (the target, its siblings, containers, root/toolbar, new nodes), and leave unrelated parts alone. Keep ids of unchanged nodes stable.

# Changing the page around the block
If the change doesn't fit inside the block, reshape the page around it (page blocks only) with "page" in apply_changes:
- "layoutOps": { "op": "upsert", "id", "node" } / { "op": "remove", "id" } / { "op": "setRoot", "id" } on the page layout. E.g. split the block's slot into a two-column grid with a new slot beside it.
- "placements": [{ "blockId", "slot", "order" }] to move blocks.
- "newBlocks": [{ "id", "slot", "order", "title"?, "frame"?, "root", "toolbar"?, "nodes" }]. New blocks read the same data as the target block (same view model paths) and start with empty UI state, which is separate from the target block's.
- "blockPatches": [{ "blockId", "title"?: string | null, "frame"?: { "style"?: "card"|"plain", "title"?: bool, "sources"?: bool, "freshness"?: bool } }] to change any block's chrome: card vs plain, and whether its title, data-source badges, and "Updated" time show.
- "removeBlocks": ["<blockId>"] to delete blocks.
When a request about chrome is phrased generally ("don't show the pills for our data sources"), apply it to every block it plausibly covers, not just the one clicked.
Prefer the smallest change that fully serves the request: inside the block first, then its toolbar, then the surrounding layout. Keep existing slots that hold blocks, and every block must end up in a slot.

Decline only when it truly can't be done with the catalog, structured HTML, data (including /meta, connected tools, and the web), and tools available. Say what's missing. Never fake data.

${dataSections}

${USER_CONTROL_GUIDE}

${TREE_GUIDE}

${HTML_GUIDE}

${STYLE_GUIDE}

${DATA_GUIDE}

${STATE_GUIDE}

${ACTIONS_GUIDE}

${LAYOUT_GUIDE}

# Catalog
${describeCatalog()}

${toolsSection(tools, canChangeData)}`;
}

/** Plain-language framing of where the edit applies. */
function describeContext(request: AmendRequest): string {
  if (request.kind === "overlay") return "The target is inside an overlay (its root must stay an overlay component; overlays have no toolbar and can't change the page).";
  if (request.kind === "page") return "The target is part of the page layout (not inside a block). Use page changes only: layout ops, block patches/placements/removals, or new blocks (which have no data of their own here).";
  return `The target is in the page block "${request.block?.title ?? request.block?.id ?? "?"}": its components, toolbar, or chrome (frame). Block ops edit its tree; page changes can patch its frame/title and reshape the page.`;
}

/** The target block's current data wiring and the workspace's sources, for data changes. */
function describeData(request: AmendRequest, workspace: Workspace | undefined): string | null {
  const block = request.block && workspace?.blocks[request.block.id];
  if (request.kind !== "block" || !block || !workspace) return null;
  const sources = Object.values(workspace.sources).map((source) =>
    source.kind === "tool"
      ? { id: source.id, kind: source.kind, connection: source.connection, tool: source.tool, args: source.args, normalize: source.normalize, key: source.key }
      : source.kind === "research"
        ? { id: source.id, kind: source.kind, query: source.query, key: source.key, rows: source.data.length }
        : { id: source.id, kind: source.kind, key: source.key },
  );
  return `This block's data now: inputs ${JSON.stringify(block.inputs)}, view ${JSON.stringify(block.view.expr)}${block.fields ? `, fields ${JSON.stringify(block.fields)}` : ""}\n\nWorkspace sources:\n${JSON.stringify(sources)}`;
}

/** User message: the request, the target, the current tree/page, and the data available. */
export function amendUserPrompt(request: AmendRequest, workspace?: Workspace): string {
  const { tree, target } = request;
  const targetNode = target.nodeId && (request.kind === "page" ? request.page?.layout.nodes[target.nodeId] : tree?.nodes[target.nodeId]);
  return [
    `Change requested: ${request.prompt}`,
    `Target: ${target.description}${target.nodeId ? ` (node "${target.nodeId}": ${JSON.stringify(targetNode)})` : ""}`,
    describeContext(request),
    request.block?.fields ? `Field definitions: ${JSON.stringify(request.block.fields)}` : null,
    tree ? `Current block tree:\n${JSON.stringify({ root: tree.root, toolbar: tree.toolbar, nodes: tree.nodes })}` : null,
    request.dataSample !== undefined ? `View model sample (arrays truncated; "ui" is UI state):\n${JSON.stringify(request.dataSample)}` : null,
    request.item !== undefined ? `Item ($item):\n${JSON.stringify(request.item)}` : null,
    describeData(request, workspace),
    request.page
      ? `${request.page.params.length > 0 ? `This page has route params ${JSON.stringify(request.page.params)} (current values ${JSON.stringify(request.route)}): data that depends on the selected item must read $route.<name> (see "Dynamic pages").\n\n` : ""}Page layout:\n${JSON.stringify(request.page.layout)}\n\nBlocks on this page (id, slot, order, title, frame):\n${JSON.stringify(request.page.blocks)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
