import { z } from "zod";
import { BlockFrameSchema } from "./frame";
import { BlockTreeSchema, LayoutTreeSchema } from "./nodes";
import { SourceSchema, type SourceStatus } from "./sources";
import { JsonSchemaSchema } from "./values";

export const SPEC_VERSION = 0;

/** Plain-language meaning and dependencies of a computed field (RFC 0002 §5.2). */
export const FieldMetaSchema = z.object({
  label: z.string(),
  definition: z.string(),
  requires: z.array(z.string()).default([]),
});
export type FieldMeta = z.infer<typeof FieldMetaSchema>;

export const BlockSchema = BlockTreeSchema.extend({
  id: z.string(),
  page: z.string(),
  slot: z.string(),
  order: z.number(),
  title: z.string().optional(),
  /** Block chrome (card or plain; title, source badges, freshness). */
  frame: BlockFrameSchema.default({ style: "card", title: true, sources: true, freshness: true }),
  inputs: z.record(z.string(), z.string()).default({}),
  view: z.object({ expr: z.string(), schema: JsonSchemaSchema }),
  fields: z.record(z.string(), FieldMetaSchema).optional(),
  /** Persisted UI state (column visibility, filters, …), readable at `/ui/...` (ADR 0001 §8). */
  ui: z.record(z.string(), z.unknown()).default({}),
});
export type Block = z.infer<typeof BlockSchema>;

/** A value a page takes from its URL, e.g. `artist` in `/w/:id/artist?artist=Adele`. */
export const PageParamSchema = z.object({
  description: z.string(),
  /** The `$item` field that fills it when the page is opened from an item (e.g. "name"). */
  from: z.string().optional(),
  /** A real value, used to dry-run the page while it's being built (e.g. "Adele"). */
  example: z.string().optional(),
  /**
   * The page renders without it (e.g. a search query `q` set by a TextInput, ADR 0013). Sources
   * that need it should skip themselves with `when` until it's set.
   */
  optional: z.boolean().default(false),
});
export type PageParam = z.infer<typeof PageParamSchema>;

export const PageSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "page ids are lowercase slugs (a-z, 0-9, -)"),
  title: z.string(),
  layout: LayoutTreeSchema,
  /** Route params, read by sources and views as `$route.<name>` (ADR 0011). */
  params: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), PageParamSchema).default({}),
  /** The deferred intent this page was generated for; clicking that intent again navigates here. */
  intent: z.object({ id: z.string(), prompt: z.string() }).optional(),
});
export type Page = z.infer<typeof PageSchema>;

export const WorkspaceSchema = z.object({
  specVersion: z.literal(SPEC_VERSION),
  catalogVersion: z.string(),
  pages: z.record(z.string(), PageSchema),
  blocks: z.record(z.string(), BlockSchema),
  sources: z.record(z.string(), SourceSchema),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/** Runtime state for one block: its evaluated view model and the status of each input. */
export type BlockView = {
  data: unknown;
  inputs: Record<string, { status: SourceStatus; fetchedAt?: string; complete?: boolean }>;
  /** Set when the view expression itself failed. */
  error?: string;
};
