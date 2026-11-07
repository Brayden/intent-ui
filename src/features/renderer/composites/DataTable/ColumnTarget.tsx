import type { MouseEvent, ReactNode } from "react";
import type { Scope } from "../../lib/resolve";
import { useTargetHandler } from "../../targeting";

type ColumnTargetProps = {
  columnId: string;
  scope: Scope;
  children: (onContextMenu: ((event: MouseEvent) => void) | undefined) => ReactNode;
};

/**
 * Makes a header or cell target its DataColumn node on right-click. Columns are rendered by
 * the table (not NodeRenderer), so they need their own hook-up.
 */
export function ColumnTarget({ columnId, scope, children }: ColumnTargetProps) {
  return <>{children(useTargetHandler(columnId, scope))}</>;
}
