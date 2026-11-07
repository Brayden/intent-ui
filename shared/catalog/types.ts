import type { z } from "zod";

/**
 * What the model and the validator know about a component: its props and how it nests.
 * The React implementation lives in `src/features/renderer`, keyed by `type`.
 */
export type CatalogSpec = {
  type: string;
  /** One or two sentences, shown to the model in the catalog prompt. */
  description: string;
  props: z.ZodType;
  /** Set when the node only makes sense inside this parent type, or one of these (e.g. DataColumn → DataTable). */
  parent?: string | string[];
  /** Which children the node accepts. Defaults to "none". */
  children?: "none" | "any" | { only: string };
  /** At most this many children of a type, e.g. `{ DialogAction: 1 }`. */
  childLimits?: Record<string, number>;
  /**
   * When the component fires the node's `action`, and what `$item` is then. Components without
   * it never fire actions, and the validator rejects an `action` on them (it would be ignored).
   */
  action?: string;
  /** True for components that can be the root of an overlay template (e.g. Dialog). */
  overlay?: boolean;
};
