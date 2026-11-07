import { Badge } from "@cloudflare/kumo/components/badge";
import type { BadgeProps } from "../../../../shared/catalog";
import type { CatalogComponentProps } from "../catalog/types";
import { formatValue } from "../lib/format";

/** Kumo `Badge` exposed to the catalog with a data-friendly `text` prop. */
export function KumoBadge({ props }: CatalogComponentProps<BadgeProps>) {
  return <Badge variant={props.variant}>{formatValue(props.text)}</Badge>;
}
