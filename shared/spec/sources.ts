import { z } from "zod";
import { DynamicValueSchema, ExprSchema, JsonSchemaSchema } from "./values";


/**
 * Where data came from when it was found on the web (ADR 0009). Citations must be pages the
 * model actually searched or fetched; they're shown to users next to the data.
 */
export const ProvenanceSchema = z.object({
  researchedAt: z.string(),
  query: z.string().optional(),
  citations: z.array(z.string().regex(/^https:\/\//, "citations must be https URLs")).min(1),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** A reusable, workspace-level tool call with a JSONata normalize step (RFC 0002 §5.1). */
export const ToolSourceSchema = z.object({
  kind: z.literal("tool"),
  id: z.string(),
  connection: z.string(),
  tool: z.string(),
  args: z.record(z.string(), z.union([DynamicValueSchema, ExprSchema])).default({}),
  inputs: z.record(z.string(), z.string()).optional(),
  normalize: z.string(),
  /**
   * JSONata condition over the inputs and `$route`: the tool is only called when it's truthy,
   * e.g. "$route.q" so a search doesn't run without a query (ADR 0013). Otherwise the source
   * is empty: [] with a `key`, else null.
   */
  when: z.string().optional(),
  key: z.string().optional(),
  schema: JsonSchemaSchema,
  /** Set when this source was compiled from web research (tier 1, ADR 0009). */
  provenance: ProvenanceSchema.optional(),
});

/** Workspace-owned data with no tool behind it, e.g. identity maps (RFC 0002 §5.3). */
export const LocalSourceSchema = z.object({
  kind: z.literal("local"),
  id: z.string(),
  key: z.string().optional(),
  data: z.unknown(),
});

/**
 * Data the model extracted from web pages, with the recipe to do it again (tier 2, ADR 0009).
 * Served from `data` on load; refreshed only on request, by replaying the recipe with the same
 * output contract (`key` + `schema`).
 */
export const ResearchSourceSchema = z.object({
  kind: z.literal("research"),
  id: z.string(),
  /** The web search query to replay. */
  query: z.string().min(1),
  /** What to extract, precisely enough to reproduce: e.g. "rank, title, artist for 1–10". */
  instructions: z.string().min(1),
  /** Domains to prefer when replaying (e.g. "billboard.com"). */
  preferSources: z.array(z.string()).default([]),
  key: z.string(),
  schema: JsonSchemaSchema.default({}),
  /** The last extracted rows (each has `key`). */
  data: z.array(z.record(z.string(), z.unknown())),
  provenance: ProvenanceSchema,
  /**
   * Route params this research depends on (ADR 0012). `query` and `instructions` use them as
   * `{name}` placeholders; each set of values is researched on first load and cached.
   */
  params: z.array(z.string()).default([]),
  /** The route values `data` was researched for (the example), when `params` is set. */
  dataFor: z.record(z.string(), z.string()).optional(),
});

export const SourceSchema = z.discriminatedUnion("kind", [ToolSourceSchema, LocalSourceSchema, ResearchSourceSchema]);
export type ToolSource = z.infer<typeof ToolSourceSchema>;
export type LocalSource = z.infer<typeof LocalSourceSchema>;
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;
export type Source = z.infer<typeof SourceSchema>;

export const SourceStatusSchema = z.enum(["ok", "loading", "stale", "error", "auth_required"]);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

/** A source's normalized result plus the metadata that separates "zero" from "unknown". */
export type SourceResult = {
  status: SourceStatus;
  data: unknown;
  complete: boolean;
  fetchedAt: string;
  error?: string;
};
