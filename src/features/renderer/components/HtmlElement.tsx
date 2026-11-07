import { cn } from "@cloudflare/kumo/utils";
import { createElement, type MouseEventHandler, type ReactNode } from "react";
import { isSafeImageUrl, isSafeLinkUrl, type HtmlNode, type SlotNode } from "../../../../shared/spec";
import { gridStyle } from "../lib/gridStyle";

/** Text and attribute values after any bindings are resolved. */
export type HtmlValues = { text?: unknown; src?: unknown; alt?: unknown; href?: unknown };

type HtmlElementProps = {
  node: HtmlNode;
  /** Resolved values; defaults to the node's own static values (layouts). */
  values?: HtmlValues;
  onContextMenu?: MouseEventHandler;
  children?: ReactNode;
};

const asText = (value: unknown) => (value === undefined || value === null ? null : String(value));

/**
 * Renders a structured HTML node (ADR 0005). Only allowlisted tags, classes, and attributes;
 * URLs are re-checked here because bound data could hold anything. Unsafe images render
 * nothing; unsafe links render as plain text.
 */
export function HtmlElement({ node, values = node, onContextMenu, children }: HtmlElementProps) {
  const grid = gridStyle(node.grid);
  const className = cn(node.className, grid.className) || undefined;
  const common = { className, style: grid.style, onContextMenu };

  if (node.tag === "hr") return <hr {...common} />;
  if (node.tag === "img") {
    const src = asText(values.src);
    if (!src || !isSafeImageUrl(src)) return null;
    return <img {...common} src={src} alt={asText(values.alt) ?? ""} loading="lazy" referrerPolicy="no-referrer" />;
  }
  const content = [asText(values.text), children];
  if (node.tag === "a") {
    const href = asText(values.href);
    if (!href || !isSafeLinkUrl(href)) return createElement("span", common, ...content);
    return createElement("a", { ...common, href, target: "_blank", rel: "noopener noreferrer" }, ...content);
  }
  return createElement(node.tag, common, ...content);
}

/** Renders a layout slot's container; blocks are passed in as children. */
export function SlotElement({ node, onContextMenu, children }: { node: SlotNode; onContextMenu?: MouseEventHandler; children: ReactNode }) {
  const grid = gridStyle(node.grid);
  return (
    <div className={cn(node.className, grid.className) || undefined} style={grid.style} onContextMenu={onContextMenu}>
      {children}
    </div>
  );
}
