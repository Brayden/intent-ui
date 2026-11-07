import { Link } from "@cloudflare/kumo/components/link";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Text } from "@cloudflare/kumo/components/text";
import type { ReactNode } from "react";
import { useInputStatus } from "../../context";
import { formatValue, UNKNOWN } from "../../lib/format";
import type { DataColumnProps } from "../../../../../shared/catalog";

type DataCellProps = {
  column: DataColumnProps;
  row: Record<string, unknown>;
  /** Custom cell content from the column's child nodes, if any. */
  template?: ReactNode;
};

/** One table cell: loading/error from the column's inputs, then a template or formatted field. */
export function DataCell({ column, row, template }: DataCellProps) {
  const status = useInputStatus(column.requires);
  if (status.loading) return <Loader size={14} />;
  if (status.failed) {
    return (
      <span className="text-kumo-danger" title="This data source failed to load">
        {UNKNOWN}
      </span>
    );
  }
  if (template) return <>{template}</>;

  const value = column.field ? row[column.field] : undefined;
  const text = formatValue(value, column.format, status.complete);
  const href = column.linkField ? row[column.linkField] : undefined;
  if (typeof href === "string" && /^https?:\/\//.test(href) && value != null) {
    return (
      <Link href={href} target="_blank" rel="noopener noreferrer">
        {text}
      </Link>
    );
  }
  const primary = <span title={value == null ? "Unknown" : undefined}>{text}</span>;
  if (!column.subField) return primary;
  return (
    <div className="flex flex-col">
      {primary}
      <Text variant="secondary" size="sm">
        {formatValue(row[column.subField])}
      </Text>
    </div>
  );
}
