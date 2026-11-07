import type { z } from "zod";
import { CATALOG } from "./catalog";
import { isHtmlNode, type BlockNode, type BlockTree } from "../spec/nodes";
import { isPathRefLike } from "../spec/values";

/** Removes `{ path }` bindings (anywhere) and returns where they were, as dotted paths. */
function stripBindings(value: unknown, at: string[] = [], found: Set<string> = new Set()): { value: unknown; found: Set<string> } {
  if (isPathRefLike(value)) {
    found.add(at.join("."));
    return { value: undefined, found };
  }
  if (Array.isArray(value)) return { value: value.map((entry, i) => stripBindings(entry, [...at, String(i)], found).value), found };
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(([key, entry]) => [key, stripBindings(entry, [...at, key], found).value]);
    return { value: Object.fromEntries(entries.filter(([, entry]) => entry !== undefined)), found };
  }
  return { value, found };
}

/**
 * Validates authored props. A `{ path }` binding is accepted wherever a value is expected,
 * since its type is only known at render time (the renderer re-validates resolved props).
 */
function propIssues(schema: z.ZodType, props: unknown): z.core.$ZodIssue[] {
  const { value, found } = stripBindings(props);
  const parsed = schema.safeParse(value);
  if (parsed.success) return [];
  return parsed.error.issues.filter((issue) => !found.has(issue.path.join(".")));
}

const CANCEL_LABEL = /^(cancel|close|dismiss|done|back|never ?mind|not now)$/i;
const PRIMARY_LABEL = /^(save|submit|confirm|create|add|update|apply|send|delete|remove|ok|yes|continue|next)\b/i;

/**
 * Dialog actions belong in its footer (Kumo LayerDialog.Actions), not as Buttons in its body:
 * cancel-type → the Dialog's `dismissLabel`; save/submit/delete-type → a DialogAction.
 */
function dialogButtonIssues(id: string, label: unknown): string[] {
  if (typeof label !== "string") return [];
  const text = label.trim();
  if (CANCEL_LABEL.test(text)) {
    return [`node "${id}": a "${text}" Button in a Dialog duplicates its dismiss button: remove it and set the Dialog's "dismissLabel" (e.g. "${text}")`];
  }
  if (PRIMARY_LABEL.test(text)) {
    return [`node "${id}": "${text}" is a dialog action: make it the Dialog's DialogAction child (footer, right) instead of a Button in the body`];
  }
  return [];
}

/** A node's type for nesting rules: its catalog type, or "html" for structured HTML. */
const typeOf = (node: BlockNode | undefined) => (node === undefined ? undefined : isHtmlNode(node) ? "html" : node.type);

/**
 * Checks a block tree against the catalog: known types, valid props, existing children,
 * parent/child rules, and no cycles. HTML nodes are schema-checked already (tags, attributes,
 * classes) and may nest freely. Returns human-readable issues (empty when valid), suitable for
 * feeding back to the model for repair.
 */
export function validateBlockTree(tree: BlockTree, options: { overlay?: boolean } = {}): string[] {
  const issues: string[] = [];
  const root = tree.nodes[tree.root];
  if (!root) return [`root "${tree.root}" is not in nodes`];
  if (options.overlay && (isHtmlNode(root) || !CATALOG[root.type]?.overlay)) {
    issues.push(`root "${tree.root}" must be an overlay component (e.g. Dialog), got "${typeOf(root)}"`);
  }

  if (tree.toolbar !== undefined) {
    if (options.overlay) issues.push("overlays have no toolbar; remove it");
    else if (!tree.nodes[tree.toolbar]) issues.push(`toolbar "${tree.toolbar}" is not in nodes`);
  }

  const seen = new Set<string>();
  const visit = (id: string, parentType: string | undefined, path: string[]) => {
    if (path.includes(id)) return void issues.push(`cycle at node "${id}"`);
    const node = tree.nodes[id];
    if (!node) return void issues.push(`node "${path.at(-1)}" references missing child "${id}"`);
    seen.add(id);

    const type = typeOf(node) ?? "?";
    const spec = isHtmlNode(node) ? undefined : CATALOG[node.type];
    if (!isHtmlNode(node)) {
      if (!spec) return void issues.push(`node "${id}": unknown type "${node.type}"`);
      const parents = spec.parent === undefined ? [] : [spec.parent].flat();
      if (parents.length > 0 && !parents.includes(parentType ?? "")) issues.push(`node "${id}": ${type} must be inside ${parents.join(" or ")}`);
      if (node.action && !spec.action) {
        const firing = Object.values(CATALOG).filter((entry) => entry.action).map((entry) => entry.type);
        issues.push(
          `node "${id}": ${type} never fires actions, so this action would do nothing. Put it on a component that fires actions (${firing.join(", ")}) or remove it`,
        );
      }
      for (const issue of propIssues(spec.props, node.props)) {
        issues.push(`node "${id}" props.${issue.path.join(".")}: ${issue.message}`);
      }
    }

    const children = node.children ?? [];
    const rule = isHtmlNode(node) ? "any" : (spec?.children ?? "none");
    if (rule === "none" && children.length > 0) issues.push(`node "${id}": ${type} takes no children`);
    for (const [limited, max] of Object.entries(spec?.childLimits ?? {})) {
      const count = children.filter((child) => typeOf(tree.nodes[child]) === limited).length;
      if (count > max) issues.push(`node "${id}": ${type} takes at most ${max} ${limited} child${max === 1 ? "" : "ren"}, got ${count}`);
    }
    for (const child of children) {
      const childType = typeOf(tree.nodes[child]);
      if (typeof rule === "object" && childType && childType !== rule.only) {
        issues.push(`node "${child}": ${type} children must be ${rule.only}, got ${childType}`);
      }
      visit(child, type, [...path, id]);
    }
  };
  visit(tree.root, undefined, []);
  if (tree.toolbar && tree.nodes[tree.toolbar]) visit(tree.toolbar, undefined, []);

  for (const id of Object.keys(tree.nodes)) if (!seen.has(id)) issues.push(`node "${id}" is unreachable from root or toolbar`);
  return issues;
}

/**
 * Generation-time lint (not applied to stored specs): Buttons in a Dialog that should be footer
 * actions. Only `changed` nodes are checked when given (so an edit isn't asked to fix old UI).
 */
export function lintDialogActions(tree: BlockTree, changed?: Set<string>): string[] {
  const issues: string[] = [];
  const walk = (id: string, inDialog: boolean, seen: Set<string>) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = tree.nodes[id];
    if (!node) return;
    if (inDialog && !isHtmlNode(node) && node.type === "Button" && (!changed || changed.has(id))) {
      issues.push(...dialogButtonIssues(id, node.props.label));
    }
    const dialog = inDialog || (!isHtmlNode(node) && node.type === "Dialog");
    for (const child of node.children ?? []) walk(child, dialog, seen);
  };
  walk(tree.root, false, new Set());
  return issues;
}
