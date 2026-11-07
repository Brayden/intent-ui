import { isHtmlNode, type BlockNode, type BlockTree } from "./nodes";
import type { Block, BlockView } from "./workspace";
import type { BlockMeta } from "./meta";
import type { RouteValues } from "./route";
import type { DynamicValue, PathRef } from "./values";
import { conditionPaths, isVisible } from "./visibility";

/*
 * How a block's tree is resolved against its data (RFC 0003 §7–8). Shared by the renderer and the
 * conformance runner, so both resolve paths and visibility the same way.
 */

/** The data a node renders against: the block's scope root, plus the current item in lists. */
export type Scope = { root: unknown; item?: unknown };

const ITEM_PREFIX = "$item";

/** Type guard for `{ path }` references. */
export function isPathRef(value: unknown): value is PathRef {
  return typeof value === "object" && value !== null && "path" in value && typeof value.path === "string";
}

/** Reads a JSON Pointer (`/a/0/b`) from a value. Returns undefined for missing segments. */
export function getByPointer(value: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return value;
  const segments = pointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  return segments.reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

/** Resolves a path against the scope; `$item/...` reads from the current item. */
export function resolvePath(path: string, scope: Scope): unknown {
  if (path.startsWith(ITEM_PREFIX)) return getByPointer(scope.item, path.slice(ITEM_PREFIX.length));
  return getByPointer(scope.root, path);
}

/** Resolves a literal-or-path value. */
export function resolveValue(value: DynamicValue | unknown, scope: Scope): unknown {
  return isPathRef(value) ? resolvePath(value.path, scope) : value;
}

/**
 * Resolves `{ path }` references anywhere in authored props (e.g. inside a form's `fields`).
 * Resolved data is substituted as-is and never walked, so data can't be mistaken for a ref.
 */
export function resolveDeep(value: unknown, scope: Scope): unknown {
  if (isPathRef(value)) return resolvePath(value.path, scope);
  if (Array.isArray(value)) return value.map((entry) => resolveDeep(entry, scope));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveDeep(entry, scope)]));
  }
  return value;
}

/**
 * Resolves an action's params. Each param is a value (or binding) on its own, so the params
 * object itself is never treated as a binding, even when it has a `path` key (e.g. `set`).
 */
export function resolveParams(params: Record<string, unknown> | undefined, scope: Scope): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params ?? {}).map(([key, value]) => [key, resolveDeep(value, scope)]));
}

/** Resolves every `{ path }` in a node's props. */
export function resolveProps(props: Record<string, unknown>, scope: Scope): Record<string, unknown> {
  return resolveDeep(props, scope) as Record<string, unknown>;
}

/**
 * The scope a block renders against: its view model, plus its UI state at `/ui/...`, its
 * chrome facts at `/meta/...` (title, sources, updatedAt, loading), and the page's route values
 * at `/route/...`. `ui`, `meta` and `route` are reserved; view models shouldn't use those keys.
 */
export function blockScope(block: Block, view: BlockView, meta: BlockMeta, item?: unknown, route: RouteValues = {}): Scope {
  const data = view.data !== null && typeof view.data === "object" && !Array.isArray(view.data) ? view.data : {};
  return { root: { ...data, ui: block.ui, meta, route }, item };
}

/** A node after resolution: bindings replaced by values, hidden children dropped. */
export type RenderedNode = Record<string, unknown> & { children?: string[] };

/** A block tree after resolution against a scope (RFC 0003 §8.3, the conformance "render" output). */
export type RenderedTree = { root: string | null; toolbar?: string | null; nodes: Record<string, RenderedNode> };

const readsItem = (path: string) => path.startsWith(ITEM_PREFIX);

/** Like resolveDeep, but leaves `$item` references in place: they're resolved per item by the component. */
function resolveOutsideItems(value: unknown, scope: Scope): unknown {
  if (isPathRef(value)) return readsItem(value.path) ? value : resolvePath(value.path, scope);
  if (Array.isArray(value)) return value.map((entry) => resolveOutsideItems(entry, scope));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveOutsideItems(entry, scope)]));
  }
  return value;
}

/**
 * Resolves a block tree against its scope, the way every conforming renderer must before handing
 * nodes to a component library: hidden nodes (and their subtrees) are dropped, props and HTML
 * fields are resolved, and action params are left as authored (they resolve when the action
 * fires). Nodes whose visibility reads `$item` keep their `visible` for per-item evaluation, and
 * `$item` bindings stay as references. Pure and deterministic.
 */
export function renderTree(tree: BlockTree, scope: Scope): RenderedTree {
  const read = (path: string) => resolvePath(path, scope);
  const nodes: Record<string, RenderedNode> = {};

  const shown = (node: BlockNode): boolean => {
    if (node.visible === undefined) return true;
    if (conditionPaths(node.visible).some(readsItem)) return true;
    return isVisible(node.visible, read);
  };

  const visit = (id: string, seen: Set<string>): boolean => {
    const node = tree.nodes[id];
    if (!node || seen.has(id) || !shown(node)) return false;
    seen.add(id);
    const children = (node.children ?? []).filter((child) => visit(child, seen));
    const keepVisible = node.visible !== undefined && conditionPaths(node.visible).some(readsItem) ? { visible: node.visible } : {};
    if (isHtmlNode(node)) {
      const { visible: _visible, children: _children, ...rest } = node;
      nodes[id] = { ...(resolveOutsideItems(rest, scope) as Record<string, unknown>), ...keepVisible, ...(node.children ? { children } : {}) };
    } else {
      nodes[id] = {
        type: node.type,
        props: resolveOutsideItems(node.props, scope),
        ...(node.children ? { children } : {}),
        ...(node.action ? { action: node.action } : {}),
        ...keepVisible,
      };
    }
    return true;
  };

  const root = visit(tree.root, new Set()) ? tree.root : null;
  const rendered: RenderedTree = { root, nodes };
  if (tree.toolbar !== undefined) rendered.toolbar = visit(tree.toolbar, new Set(Object.keys(nodes))) ? tree.toolbar : null;
  return rendered;
}
