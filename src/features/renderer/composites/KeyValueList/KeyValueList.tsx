import { Text } from "@cloudflare/kumo/components/text";
import type { KeyValueListProps } from "../../../../../shared/catalog";
import type { CatalogComponentProps } from "../../catalog/types";
import { formatValue } from "../../lib/format";

/** Label/value pairs for one record. */
export function KeyValueList({ props }: CatalogComponentProps<KeyValueListProps>) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
      {props.items.map((item) => (
        <div key={item.label} className="contents">
          <dt>
            <Text variant="secondary" size="sm">
              {item.label}
            </Text>
          </dt>
          <dd>
            <Text>{formatValue(item.value, item.format)}</Text>
          </dd>
        </div>
      ))}
    </dl>
  );
}
