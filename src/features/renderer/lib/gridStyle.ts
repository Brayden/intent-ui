import type { CSSProperties } from "react";
import type { Breakpoint, GridTemplate } from "../../../../shared/spec";

/*
 * Literal class names so Tailwind compiles them at build time. Each reads a CSS variable
 * that `gridStyle` sets inline, which is how runtime grid templates get responsive CSS.
 */
const COLUMN_CLASSES: Record<Breakpoint, string> = {
  base: "grid-cols-(--cols)",
  sm: "sm:grid-cols-(--cols-sm)",
  md: "md:grid-cols-(--cols-md)",
  lg: "lg:grid-cols-(--cols-lg)",
  xl: "xl:grid-cols-(--cols-xl)",
};
const ROW_CLASSES: Record<Breakpoint, string> = {
  base: "grid-rows-(--rows)",
  sm: "sm:grid-rows-(--rows-sm)",
  md: "md:grid-rows-(--rows-md)",
  lg: "lg:grid-rows-(--rows-lg)",
  xl: "xl:grid-rows-(--rows-xl)",
};

const varName = (axis: "cols" | "rows", breakpoint: Breakpoint) =>
  breakpoint === "base" ? `--${axis}` : `--${axis}-${breakpoint}`;

/** Converts a node's grid template into classes + inline CSS variables. */
export function gridStyle(grid?: GridTemplate): { className?: string; style?: CSSProperties } {
  if (!grid) return {};
  const classes: string[] = [];
  const style: Record<string, string> = {};
  const apply = (axis: "cols" | "rows", tracks: Partial<Record<Breakpoint, string>> | undefined) => {
    for (const [breakpoint, value] of Object.entries(tracks ?? {}) as [Breakpoint, string][]) {
      classes.push((axis === "cols" ? COLUMN_CLASSES : ROW_CLASSES)[breakpoint]);
      style[varName(axis, breakpoint)] = value;
    }
  };
  apply("cols", grid.columns);
  apply("rows", grid.rows);
  return { className: classes.join(" "), style: style as CSSProperties };
}
