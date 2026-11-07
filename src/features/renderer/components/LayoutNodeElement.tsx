import type { ReactNode } from "react";
import type { LayoutNode } from "../../../../shared/spec";
import { useLayoutTargetHandler } from "../targeting";
import { HtmlElement, SlotElement } from "./HtmlElement";

type LayoutNodeElementProps = { pageId: string; id: string; node: LayoutNode; children: ReactNode };

/** One layout node (HTML element or slot), right-clickable to change the layout. */
export function LayoutNodeElement({ pageId, id, node, children }: LayoutNodeElementProps) {
  const onContextMenu = useLayoutTargetHandler(pageId, id, node);
  return node.kind === "html" ? (
    <HtmlElement node={node} onContextMenu={onContextMenu}>
      {children}
    </HtmlElement>
  ) : (
    <SlotElement node={node} onContextMenu={onContextMenu}>
      {children}
    </SlotElement>
  );
}
