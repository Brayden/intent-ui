import type { KeyboardEvent, MouseEvent } from "react";
import type { Action } from "../../../../../shared/spec";
import { useBlock, useDispatch } from "../../context";
import type { Scope } from "../../lib/resolve";

/** Controls inside a row that handle their own clicks (they shouldn't also trigger the row). */
const OWN_CLICKS = "a, button, input, select, textarea, label, [role=button], [role=checkbox], [role=menuitem], [contenteditable]";

const handledInside = (event: MouseEvent | KeyboardEvent) =>
  event.target instanceof Element && event.target !== event.currentTarget && event.target.closest(OWN_CLICKS) !== null;

/**
 * Makes rows clickable when the table node has an `action`: a click (or Enter/Space on a focused
 * row) fires it with `$item` = the row. Returns the props to spread on each row, or undefined.
 */
export function useRowAction(action: Action | undefined, nodeId: string, scope: Scope) {
  const { block } = useBlock();
  const dispatch = useDispatch();
  if (!action) return undefined;

  return (row: Record<string, unknown>) => {
    const fire = () => void dispatch(action, { blockId: block.id, nodeId, scope: { root: scope.root, item: row } });
    return {
      tabIndex: 0,
      className: "cursor-pointer hover:bg-kumo-tint focus-visible:bg-kumo-tint focus-visible:outline-none",
      onClick: (event: MouseEvent) => {
        if (!handledInside(event) && !window.getSelection()?.toString()) fire();
      },
      onKeyDown: (event: KeyboardEvent) => {
        if ((event.key === "Enter" || event.key === " ") && !handledInside(event)) {
          event.preventDefault();
          fire();
        }
      },
    };
  };
}
