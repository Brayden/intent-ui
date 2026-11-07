import type { ReactNode } from "react";
import { isHtmlNode, isVisible, type ComponentNode, type HtmlNode } from "../../../../shared/spec";
import { catalog } from "../catalog";
import { useBlock } from "../context";
import { resolvePath, resolveProps, resolveValue, type Scope } from "../lib/resolve";
import { useTargetHandler } from "../targeting";
import { HtmlElement } from "./HtmlElement";
import { NodeError } from "./NodeError";

type NodeProps = { id: string; scope: Scope };

/** Structured HTML inside a block: bindings resolved, children rendered as block nodes. */
function BlockHtml({ id, node, scope }: NodeProps & { node: HtmlNode }) {
  const onContextMenu = useTargetHandler(id, scope);
  const values = {
    text: resolveValue(node.text, scope),
    src: resolveValue(node.src, scope),
    alt: resolveValue(node.alt, scope),
    href: resolveValue(node.href, scope),
  };
  return (
    <HtmlElement node={node} values={values} onContextMenu={onContextMenu}>
      {node.children?.map((child) => <NodeRenderer key={child} id={child} scope={scope} />)}
    </HtmlElement>
  );
}

/** A catalog component: props resolved and validated, then rendered by its implementation. */
function BlockComponent({ id, node, scope }: NodeProps & { node: ComponentNode }) {
  const onContextMenu = useTargetHandler(id, scope);
  const entry = catalog[node.type];
  if (!entry?.component) return <NodeError id={id} message={`Unknown component "${node.type}"`} />;
  if (entry.spec.parent) return null; // rendered by its parent (e.g. DataColumn inside DataTable)

  const parsed = entry.spec.props.safeParse(resolveProps(node.props, scope));
  if (!parsed.success) return <NodeError id={id} message={parsed.error.issues[0]?.message ?? "Invalid props"} />;

  const renderNode = (childId: string, childScope: Scope): ReactNode => (
    <NodeRenderer key={childId} id={childId} scope={childScope} />
  );
  const Component = entry.component;
  const rendered = <Component nodeId={id} node={node} props={parsed.data} scope={scope} renderNode={renderNode} />;
  // `contents` adds no box, so layout is unchanged; it only catches right-clicks for targeting.
  return onContextMenu ? (
    <span className="contents" onContextMenu={onContextMenu}>
      {rendered}
    </span>
  ) : (
    rendered
  );
}

/** Renders one node of the current block, if visible: structured HTML or a catalog component. */
export function NodeRenderer({ id, scope }: NodeProps) {
  const { block } = useBlock();
  const node = block.nodes[id];
  if (!node) return <NodeError id={id} message="Unknown node" />;
  if (!isVisible(node.visible, (path) => resolvePath(path, scope))) return null;
  return isHtmlNode(node) ? <BlockHtml id={id} node={node} scope={scope} /> : <BlockComponent id={id} node={node} scope={scope} />;
}
