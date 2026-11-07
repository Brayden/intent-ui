import type { DataTableProps } from "../../../../../shared/catalog";
import { useBlock, useDispatch } from "../../context";
import { asList, toggleMember } from "../../lib/listState";
import { resolvePath, type Scope } from "../../lib/resolve";

type Rows = NonNullable<DataTableProps["rows"]>;

/**
 * Row selection for a DataTable, stored as a list of row keys at `selectionBind` (UI state).
 * Returns null when selection is off.
 */
export function useRowSelection(props: DataTableProps, nodeId: string, scope: Scope, rows: Rows) {
  const { block } = useBlock();
  const dispatch = useDispatch();
  if (!props.selectionBind) return null;

  const bind = props.selectionBind;
  const selected = asList(resolvePath(bind, scope));
  const keys = rows.map((row) => row[props.rowKey]);
  const selectedCount = keys.filter((key) => selected.includes(key)).length;
  const write = (value: unknown[]) =>
    void dispatch({ name: "set", params: { path: bind, value } }, { blockId: block.id, nodeId, scope });

  return {
    isSelected: (row: Rows[number]) => selected.includes(row[props.rowKey]),
    allSelected: selectedCount > 0 && selectedCount === keys.length,
    someSelected: selectedCount > 0 && selectedCount < keys.length,
    toggleRow: (row: Rows[number], on: boolean) => write(toggleMember(selected, row[props.rowKey], on)),
    // Select-all only touches this table's rows, so other selected keys are kept.
    toggleAll: (on: boolean) =>
      write(on ? [...selected, ...keys.filter((key) => !selected.includes(key))] : selected.filter((key) => !keys.includes(key))),
  };
}
