import type { HostEditRequest, ToolInfo } from "../../shared/api";
import { describeCatalog } from "../../shared/catalog";
import { DATA_GUIDE, HTML_GUIDE, SOURCES_GUIDE, STATE_GUIDE, STYLE_GUIDE, toolsSection, TREE_GUIDE, USER_CONTROL_GUIDE } from "../llm/guides";
import { READING_SAMPLE, sampleForModel } from "../compose/sample";

const HOST_GUIDE = `# Changing a host page
You're customizing a page of an existing product (the host), not an Intent UI page. You can't edit the host's code; you add a change on top of one element (the target) with apply_host_change:
- "hide": hide the target (e.g. "remove this banner").
- "insert": add new UI "before" or "after" the target (e.g. "add a summary above this table").
- "replace": show new UI instead of the target (e.g. "show these as cards grouped by status"). The original stays in the page, hidden, and keeps feeding your UI its data.

New UI is a block: a tree (as in "Tree format") plus "view": a JSONata expression returning the view model the tree binds to with "/..." paths. The view can read:
1. $host: the target's content, read live from the page every time it changes.
2. The user's connected data: declare the block's own "sources" (as in "Data sources"; tool or local) and "inputs" ({ alias: sourceId }); each input is bound in the view as $alias. Use them whenever the request needs data the page doesn't show (e.g. "list my Cloudflare Workers" on a page that only shows a count). Inspect the tool's real output first with inspect_tool.
$host shapes:
- a table: { "kind": "table", "columns": [header text…], "rows": [{ "<header>": "<cell text>" }] }
- a list: { "kind": "list", "items": ["…"] }
- anything else: { "kind": "text", "text": "…" }
$host values are strings as displayed (e.g. "820k", "312"); convert with $number() where needed and handle values that aren't numbers.
Prefer "insert" to add new data near the target, and "replace" to show the target's own content differently.
Actions in host blocks: "set" (UI state), "refresh" (reload the block's sources) and "navigate" with { "url" } only.
The server runs the block's sources on the user's real connections and evaluates the view before accepting; failures come back to you to fix.
Keep it fitting the host: same density and tone, Kumo components and tokens.`;

/** System prompt for host-page edits. Stable for a given set of connections, so it's cached. */
export function hostSystemPrompt(tools: ToolInfo[]): string {
  return `You customize existing web products for their users with Intent UI. The user right-clicked an element of the product's page and described a change. Deliver exactly what they asked, as one change. Respond with tool calls only: inspect_tool as needed, then exactly one apply_host_change (or decline).

${HOST_GUIDE}

${USER_CONTROL_GUIDE}

${TREE_GUIDE}

${HTML_GUIDE}

${STYLE_GUIDE}

${DATA_GUIDE}

${STATE_GUIDE}

${SOURCES_GUIDE}

# Catalog
${describeCatalog()}

${toolsSection(tools, true)}`;
}

export function hostUserPrompt(request: HostEditRequest): string {
  const { element, current, page, prompt } = request;
  return [
    `Request: ${prompt}`,
    `Page: ${page}`,
    `Target element: <${element.tag}> ${element.id}`,
    `Its visible text:\n${element.text.slice(0, 1500)}`,
    `$host (live data):\n${JSON.stringify(sampleForModel(element.data, READING_SAMPLE))}`,
    current
      ? `This element already has a change the user is revising (keep what they didn't ask to change):\n${JSON.stringify({ op: current.op, ...("block" in current ? { position: "position" in current ? current.position : undefined, block: current.block } : {}) })}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
