import { Text } from "@cloudflare/kumo/components/text";
import type { TextProps } from "../../../../shared/catalog";
import type { CatalogComponentProps } from "../catalog/types";
import { formatValue } from "../lib/format";

/** Kumo `Text` exposed to the catalog with a data-friendly `text` prop. */
export function KumoText({ props }: CatalogComponentProps<TextProps>) {
  const content = `${props.prefix ?? ""}${formatValue(props.text, props.format)}${props.suffix ?? ""}`;
  if (props.variant === "mono") return <Text variant="mono">{content}</Text>;
  return (
    <Text variant={props.variant} size={props.size}>
      {content}
    </Text>
  );
}
