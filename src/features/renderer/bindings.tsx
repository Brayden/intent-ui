import { createContext, useContext, type ReactNode } from "react";
import type { CatalogComponent } from "./catalog/types";

/*
 * Component bindings (RFC 0003 §7.3): a host maps catalog types to its own components. A binding
 * changes how a type looks, never what it means: props are validated against the same catalog
 * spec first, and visibility, actions and right-click targeting work the same.
 */
const BindingsContext = createContext<Partial<Record<string, CatalogComponent>>>({});

export function ComponentBindingsProvider({ bindings, children }: { bindings: Partial<Record<string, CatalogComponent>>; children: ReactNode }) {
  return <BindingsContext.Provider value={bindings}>{children}</BindingsContext.Provider>;
}

export const useComponentBindings = () => useContext(BindingsContext);
