import type { ComponentType, ReactNode } from "react";
import type { ComponentNode } from "../../../../shared/spec";
import type { Scope } from "../lib/resolve";

/** Props every catalog component receives from the renderer. */
export type CatalogComponentProps<P> = {
  nodeId: string;
  node: ComponentNode;
  /** Props after `{ path }` resolution and validation against the shared catalog spec. */
  props: P;
  scope: Scope;
  /** Renders a child node from the same block, optionally with a different scope. */
  renderNode: (id: string, scope: Scope) => ReactNode;
};

/** A React implementation for a catalog type (the spec lives in `shared/catalog`). */
export type CatalogComponent = ComponentType<CatalogComponentProps<unknown>>;

/** Types a component against its props, then widens it for the registry. */
export function component<P>(implementation: ComponentType<CatalogComponentProps<P>>): CatalogComponent {
  // Safe: the renderer only passes props that the matching catalog spec has parsed.
  return implementation as unknown as CatalogComponent;
}
