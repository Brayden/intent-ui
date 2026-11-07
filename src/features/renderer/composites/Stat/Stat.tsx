import { Loader } from "@cloudflare/kumo/components/loader";
import { Text } from "@cloudflare/kumo/components/text";
import type { CatalogComponentProps } from "../../catalog/types";
import { useInputStatus } from "../../context";
import { formatValue, UNKNOWN } from "../../lib/format";
import type { StatProps } from "../../../../../shared/catalog";

/** A labelled headline number with loading, unknown, and lower-bound handling. */
export function Stat({ props }: CatalogComponentProps<StatProps>) {
  const status = useInputStatus(props.requires);
  const value = status.failed ? UNKNOWN : formatValue(props.value, props.format, status.complete);

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-kumo-hairline bg-kumo-base p-4">
      <Text variant="secondary" size="sm">
        {props.label}
      </Text>
      <div className="flex min-h-0 items-center text-2xl font-semibold text-kumo-default tabular-nums">
        {status.loading ? <Loader size={20} /> : value}
      </div>
      {props.hint && (
        <Text variant="secondary" size="xs">
          {props.hint}
        </Text>
      )}
    </div>
  );
}
