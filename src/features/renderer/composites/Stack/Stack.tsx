import type { StackProps } from "../../../../../shared/catalog";
import type { CatalogComponentProps } from "../../catalog/types";

/* Literal class maps so Tailwind compiles every option. */
const GAP = { none: "gap-0", sm: "gap-2", base: "gap-4", lg: "gap-6" } as const;
const ALIGN = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" } as const;
const JUSTIFY = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" } as const;

/** Arranges children in a row or column. */
export function Stack({ node, props, scope, renderNode }: CatalogComponentProps<StackProps>) {
  const className = [
    "flex min-w-0",
    props.direction === "row" ? "flex-row" : "flex-col",
    props.wrap ? "flex-wrap" : undefined,
    GAP[props.gap],
    ALIGN[props.align],
    JUSTIFY[props.justify],
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={className}>{node.children?.map((id) => renderNode(id, scope))}</div>;
}
