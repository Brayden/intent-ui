import { z } from "zod";
import { BlockTreeSchema } from "../spec/nodes";
import { FieldMetaSchema } from "../spec/workspace";

/** What the client knows about the block an intent came from (never raw source data). */
export const BlockContextSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  /** Short structural description, e.g. "DataTable with columns: Name, Open PRs". */
  summary: z.string(),
  fields: z.record(z.string(), FieldMetaSchema).optional(),
  /** Connections behind the block's inputs. */
  connections: z.array(z.string()),
});
export type BlockContext = z.infer<typeof BlockContextSchema>;

/**
 * A materialized intent: an overlay UI tree plus what it's for and what it needs, so it can
 * be found and reused by later intents (ADR 0003).
 */
export const TemplateSchema = BlockTreeSchema.extend({
  id: z.string(),
  /** The intent it was first generated for. */
  intentId: z.string(),
  prompt: z.string(),
  /** One sentence, written by the model: what this UI does. */
  summary: z.string(),
  /** Derived from the tree by the server (see `templateRequirements`). */
  itemFields: z.array(z.string()),
  tools: z.array(z.string()),
});
export type Template = z.infer<typeof TemplateSchema>;

/** POST /api/intents/materialize — reuse or generate UI for a deferred intent (RFC 0001 §8.3). */
export const MaterializeRequestSchema = z.object({
  intent: z.object({ id: z.string(), prompt: z.string() }),
  /** The current `$item` (e.g. the clicked row), if the intent fired inside a list. */
  item: z.unknown().optional(),
  block: BlockContextSchema,
  /** Existing templates compatible with this item; the model may reuse one instead of generating. */
  candidates: z.array(TemplateSchema).max(20).default([]),
});
export type MaterializeRequest = z.infer<typeof MaterializeRequestSchema>;

export type MaterializeResponse = {
  template: Template;
  /** True when an existing candidate was chosen instead of generating. */
  reused: boolean;
  /** The model's one-line reason for reusing or not. */
  reason?: string;
  attempts: number;
  /** Compiled CSS for the template's classes; inject before rendering (ADR 0006). */
  css: string;
};
