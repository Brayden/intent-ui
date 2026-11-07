import { isHtmlNode, type BlockTree } from "./nodes";
import type { Workspace } from "./workspace";

const readsRoute = (text: string | undefined) => text !== undefined && /\$route\b/.test(text);

/** Whether a source (or anything it reads) varies with the page's route values (ADR 0011/0012). */
export function sourceUsesRoute(workspace: Workspace, sourceId: string, seen = new Set<string>()): boolean {
  if (seen.has(sourceId)) return false;
  seen.add(sourceId);
  const source = workspace.sources[sourceId];
  if (!source) return false;
  if (source.kind === "research") return source.params.length > 0;
  if (source.kind !== "tool") return false;
  const args = Object.values(source.args).some((arg) => arg !== null && typeof arg === "object" && "expr" in arg && readsRoute(String(arg.expr)));
  return args || readsRoute(source.normalize) || Object.values(source.inputs ?? {}).some((id) => sourceUsesRoute(workspace, id, seen));
}

/** Blocks on a page whose data varies with the route. */
export function routeDependentBlocks(workspace: Workspace, pageId: string): string[] {
  return Object.values(workspace.blocks)
    .filter((block) => block.page === pageId)
    .filter((block) => readsRoute(block.view.expr) || Object.values(block.inputs).some((id) => sourceUsesRoute(workspace, id)))
    .map((block) => block.id);
}

/** Where a page is opened from: blocks whose actions lead to it (its intent, or navigate to it). */
export function pageOpeners(workspace: Workspace, pageId: string): Array<{ blockId: string; page: string; tree: BlockTree }> {
  const page = workspace.pages[pageId];
  return Object.values(workspace.blocks)
    .filter((block) =>
      Object.values(block.nodes).some((node) => {
        if (isHtmlNode(node) || !node.action) return false;
        const params = node.action.params ?? {};
        if (node.action.name === "intent") return page?.intent !== undefined && params.id === page.intent.id;
        return node.action.name === "navigate" && params.page === pageId;
      }),
    )
    .map((block) => ({ blockId: block.id, page: block.page, tree: { root: block.root, toolbar: block.toolbar, nodes: block.nodes } }));
}

/** Route params a tree writes: TextInput binds and `set` actions on "/route/<name>" (ADR 0013). */
export function routeWrites(tree: BlockTree): string[] {
  const names = new Set<string>();
  const add = (path: unknown) => typeof path === "string" && path.startsWith("/route/") && names.add(path.slice("/route/".length));
  for (const node of Object.values(tree.nodes)) {
    if (isHtmlNode(node)) continue;
    if (node.type === "TextInput") add(node.props.bind);
    if (node.action?.name === "set") add(node.action.params?.path);
  }
  return [...names];
}

/** Issues for route writes to params the page doesn't declare (they'd do nothing). */
export function routeWriteIssues(tree: BlockTree, params: string[]): string[] {
  return routeWrites(tree)
    .filter((name) => !params.includes(name))
    .map((name) => `writes "/route/${name}" but the page has no "${name}" param: add it (optional, for a search box) with "pageParams"`);
}
