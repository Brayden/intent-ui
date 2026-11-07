import { Empty } from "@cloudflare/kumo/components/empty";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Table } from "@cloudflare/kumo/components/table";
import {
  DataColumnPropsSchema,
  type DataColumnProps,
  type DataTableProps,
} from "../../../../../shared/catalog";
import { isHtmlNode, isVisible } from "../../../../../shared/spec";
import type { CatalogComponentProps } from "../../catalog/types";
import { resolvePath, type Scope } from "../../lib/resolve";
import { useBlock, useInputStatus } from "../../context";
import { ColumnTarget } from "./ColumnTarget";
import { DataCell } from "./DataCell";
import { useRowAction } from "./useRowAction";
import { useRowSelection } from "./useRowSelection";

type Column = { id: string; props: DataColumnProps; cellNodes: string[] };

/** Reads the table's visible DataColumn child nodes, in order. Invalid columns are skipped. */
function useColumns(childIds: string[] = [], scope: Scope): Column[] {
  const { block } = useBlock();
  return childIds.flatMap((id) => {
    const node = block.nodes[id];
    if (isHtmlNode(node) || node?.type !== "DataColumn") return [];
    if (!isVisible(node.visible, (path) => resolvePath(path, scope))) return [];
    const parsed = DataColumnPropsSchema.safeParse(node.props);
    return parsed.success ? [{ id, props: parsed.data, cellNodes: node.children ?? [] }] : [];
  });
}

const alignClass = (column: Column) => (column.props.align === "right" ? "text-right" : undefined);

/**
 * A table over an array in the view model, with columns as addressable child nodes. With an
 * `action` on the table node, each row is clickable and fires it for that row.
 */
export function DataTable({ nodeId, node, props, scope, renderNode }: CatalogComponentProps<DataTableProps>) {
  const columns = useColumns(node.children, scope);
  const { block } = useBlock();
  const status = useInputStatus(props.requires);
  const selection = useRowSelection(props, nodeId, scope, props.rows ?? []);
  const rowAction = useRowAction(node.action, nodeId, scope);

  if (!props.rows) {
    return status.loading ? <Loader /> : <Empty title="Couldn't load this data" size="sm" />;
  }
  if (props.rows.length === 0) {
    return <Empty title={props.emptyTitle} description={props.emptyDescription} size="sm" />;
  }

  const definitionOf = (column: Column) => (column.props.field ? block.fields?.[column.props.field]?.definition : undefined);

  return (
    <Table>
      <Table.Header>
        <Table.Row>
          {selection && (
            <Table.CheckHead
              aria-label="Select all rows"
              checked={selection.allSelected}
              indeterminate={selection.someSelected}
              onCheckedChange={selection.toggleAll}
            />
          )}
          {columns.map((column) => (
            <ColumnTarget key={column.id} columnId={column.id} scope={scope}>
              {(onContextMenu) => (
                <Table.Head className={alignClass(column)} onContextMenu={onContextMenu}>
                  <span title={definitionOf(column)}>{column.props.header}</span>
                </Table.Head>
              )}
            </ColumnTarget>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {props.rows.map((row) => {
          const rowScope = { root: scope.root, item: row };
          return (
            <Table.Row
              key={String(row[props.rowKey])}
              variant={selection?.isSelected(row) ? "selected" : "default"}
              {...rowAction?.(row)}
            >
              {selection && (
                <Table.CheckCell
                  aria-label="Select row"
                  checked={selection.isSelected(row)}
                  onCheckedChange={(on) => selection.toggleRow(row, on)}
                />
              )}
              {columns.map((column) => (
                <ColumnTarget key={column.id} columnId={column.id} scope={rowScope}>
                  {(onContextMenu) => (
                    <Table.Cell className={alignClass(column)} onContextMenu={onContextMenu}>
                      <DataCell
                        column={column.props}
                        row={row}
                        template={column.cellNodes.length > 0 ? column.cellNodes.map((id) => renderNode(id, rowScope)) : undefined}
                      />
                    </Table.Cell>
                  )}
                </ColumnTarget>
              ))}
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}
