import { createContext, useContext, type MouseEvent, type ReactNode } from "react";
import { isHtmlNode, type LayoutNode } from "../../../shared/spec";
import { useBlock } from "./context";
import type { Scope } from "./lib/resolve";

/** Parts of a block's chrome that can be targeted. */
export type FramePart = "frame" | "title" | "sources" | "freshness";

type Point = { x: number; y: number };

/**
 * Anything the user can right-click to change (RFC 0001 §4.3): a component in a block, part
 * of a block's chrome, or an element of the page layout.
 */
export type ElementTarget =
  | { kind: "node"; blockId: string; nodeId: string; label: string; scope: Scope; point: Point }
  | { kind: "frame"; blockId: string; part: FramePart; label: string; point: Point }
  | { kind: "layout"; pageId: string; nodeId: string; label: string; point: Point };

type TargetHandler = (target: ElementTarget) => void;
type ContextMenuHandler = ((event: MouseEvent) => void) | undefined;
const TargetContext = createContext<TargetHandler | null>(null);

/** Enables right-click targeting for everything rendered inside. */
export function TargetProvider({ onTarget, children }: { onTarget: TargetHandler; children: ReactNode }) {
  return <TargetContext.Provider value={onTarget}>{children}</TargetContext.Provider>;
}

/** Wraps a target factory as an `onContextMenu` handler. Innermost wins; Shift keeps the browser menu. */
function useHandler(build: (point: Point) => ElementTarget): ContextMenuHandler {
  const onTarget = useContext(TargetContext);
  if (!onTarget) return undefined;
  return (event: MouseEvent) => {
    if (event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    onTarget(build({ x: event.clientX, y: event.clientY }));
  };
}

const LABEL_PROPS = ["header", "label", "title", "text"] as const;

/** Targets a component node of the current block. */
export function useTargetHandler(nodeId: string, scope: Scope): ContextMenuHandler {
  const { block } = useBlock();
  return useHandler((point) => {
    const node = block.nodes[nodeId];
    let label = nodeId;
    if (isHtmlNode(node)) label = `${node.tag}${typeof node.text === "string" ? ` "${node.text}"` : ""}`;
    else if (node) {
      const text = LABEL_PROPS.map((key) => node.props[key]).find((value) => typeof value === "string");
      label = `${node.type}${text ? ` "${text}"` : ""}`;
    }
    return { kind: "node", blockId: block.id, nodeId, label, scope, point };
  });
}

const PART_LABELS: Record<FramePart, string> = {
  frame: "block",
  title: "block title",
  sources: "data source badges",
  freshness: "“Updated” time",
};

/** Targets part of the current block's chrome. */
export function useFrameTargetHandler(part: FramePart): ContextMenuHandler {
  const { block } = useBlock();
  return useHandler((point) => ({
    kind: "frame",
    blockId: block.id,
    part,
    label: `${PART_LABELS[part]} of “${block.title ?? block.id}”`,
    point,
  }));
}

/** Targets an element of a page layout. */
export function useLayoutTargetHandler(pageId: string, nodeId: string, node: LayoutNode): ContextMenuHandler {
  return useHandler((point) => ({
    kind: "layout",
    pageId,
    nodeId,
    label: node.kind === "slot" ? `layout area “${nodeId}”` : `${node.tag}${node.text ? ` “${node.text}”` : ` “${nodeId}”`}`,
    point,
  }));
}
