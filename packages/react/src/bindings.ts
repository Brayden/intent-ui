import type { ComponentType } from "react";
import type { CatalogProps, CatalogType } from "../../../shared/catalog";
import type { CatalogComponentProps } from "../../../src/features/renderer";

/**
 * What a binding for catalog type K receives:
 * - `props`: the type's props, validated against the catalog and with `{ path }` bindings resolved
 *   (see `CatalogProps` or docs/spec/catalogs/kumo-2.17.json for each type's contract).
 * - `childNodes`: its children as data (e.g. a DataTable's DataColumns), and `renderNode(id, scope)`
 *   to render any child node.
 * - `fireAction()`: runs the node's action (e.g. a Button's click), as the catalog describes.
 * - `node`, `nodeId`, `scope`: the raw node and its data scope, for advanced cases.
 */
export type BindingProps<K extends CatalogType> = CatalogComponentProps<CatalogProps[K]>;

/** Host components for catalog types. Any type left out uses the built-in Kumo implementation. */
export type ComponentBindings = { [K in CatalogType]?: ComponentType<BindingProps<K>> };

/** Children rendered by their parent: bind the parent instead. */
const RENDERED_BY_PARENT = new Set<string>(["DataColumn", "MenuItem", "DialogAction"]);

/** Identity helper that type-checks a bindings object. Warns (in development) about bindings that won't apply. */
export function defineBindings(bindings: ComponentBindings): ComponentBindings {
  if (import.meta.env?.DEV) {
    for (const type of Object.keys(bindings)) {
      if (RENDERED_BY_PARENT.has(type)) console.warn(`[intent-ui] "${type}" is rendered by its parent; bind the parent type instead (read children from childNodes).`);
    }
  }
  return bindings;
}
