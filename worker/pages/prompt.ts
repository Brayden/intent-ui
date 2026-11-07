import type { BlockContext } from "../../shared/api";
import type { Workspace } from "../../shared/spec";
import { composeSystemPrompt, describeWorkspace } from "../compose/prompt";
import type { ToolInfo } from "../../shared/api";

const PAGE_GUIDE = `# Generating a page for an intent
The user clicked a control whose intent opens a new page (e.g. "Go to this artist's profile"). Build that page: one page that works for ANY item of this kind, not just the one clicked.
- Route params: declare in "params" what identifies the item (e.g. { "artist": { "description": "Artist name", "from": "artist" } }). "from" is the field of the clicked item that fills it; it must exist on the item shown below. Use few params (usually one id or name).
- Everything item-specific reads the route: source args as { "expr": "$route.artist" } (or built from it, e.g. "'https://…?q=' & $encodeUrlComponent($route.artist)"), normalize and view expressions via $route.<name>. Never hardcode the clicked item's values: they're only the dry run.
- Data that's the same for every item can be any source. Item-specific data must vary with $route: see "Dynamic pages" (a verified public JSON API via web/fetch, else a parameterized research source). A plain research source is a fixed snapshot and would show the clicked item for every item.
- The layout is static HTML (no data), so the page's heading and anything showing route values goes in blocks; use the layout for structure.
- Start with a way back: a small ghost Button "← <previous page title>" with { "name": "navigate", "params": { "page": "<the page it came from>" } } at the top.
- Make it a real destination (header, key facts, related lists), on brand, not a modal's worth of content.`;

export function pageSystemPrompt(tools: ToolInfo[]): string {
  return `${composeSystemPrompt(tools)}

${PAGE_GUIDE}

# create_page
Like compose_changes, plus "title" (the page's title) and "params". The page starts with an empty layout: { "root": "page", "nodes": { "page": <div>, "main": <slot> } }; reshape it with layoutOps. Respond with exactly one create_page (or decline).`;
}

export function pageUserPrompt(
  intent: { id: string; prompt: string },
  item: unknown,
  from: { pageId: string; block?: BlockContext },
  workspace: Workspace,
): string {
  return [
    `Intent: ${intent.prompt} (id "${intent.id}")`,
    `Clicked item (fills the params for the dry run): ${JSON.stringify(item ?? null).slice(0, 2000)}`,
    `Clicked from page "${from.pageId}"${from.block ? `, block ${JSON.stringify(from.block)}` : ""}.`,
    describeWorkspace(workspace, from.pageId),
  ].join("\n\n");
}
