import { z } from "zod";
import { BlockTreeSchema } from "../spec/nodes";
import { SourceSchema } from "../spec/sources";

/*
 * Customizing a host app's own UI (the SDK's patch layer). Elements are addressed by the stable
 * ids the Vite plugin adds. Generated blocks read the target's live content as `$host`, so a
 * replaced table keeps showing the host's current rows.
 */

/** What the SDK reads from a host element, live, for generated blocks to use. */
export const HostDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("table"), columns: z.array(z.string()), rows: z.array(z.record(z.string(), z.string())) }),
  z.object({ kind: z.literal("list"), items: z.array(z.string()) }),
  z.object({ kind: z.literal("text"), text: z.string() }),
]);
export type HostData = z.infer<typeof HostDataSchema>;

/** A right-clicked host element, as the model sees it. */
export const HostElementSchema = z.object({
  /** Its `data-iui-id`, e.g. "src/pages/WorkersPage.tsx:WorkersPage:2". */
  id: z.string().min(1),
  /** HTML tag of the element. */
  tag: z.string(),
  /** Visible text, trimmed. */
  text: z.string().max(4000),
  data: HostDataSchema,
});
export type HostElement = z.infer<typeof HostElementSchema>;

/**
 * UI generated for a host page: a block tree whose view reads `$host` (the target's live data)
 * and, optionally, data sources it declares (connected tools, read through the gatekeeper).
 */
export const HostBlockSchema = BlockTreeSchema.extend({
  /** JSONata over `$host` and each input (as `$alias`), producing the view model the tree binds to. */
  view: z.object({ expr: z.string().min(1) }),
  /** alias → id of one of `sources`. */
  inputs: z.record(z.string(), z.string()).default({}),
  /** The block's own sources (tool or local), run on the server. */
  sources: z.array(SourceSchema).default([]),
});
export type HostBlock = z.infer<typeof HostBlockSchema>;

const base = {
  id: z.string().min(1),
  /** The host page (pathname) it applies to; omitted for elements on every page. */
  page: z.string().optional(),
  /** The target's `data-iui-id`. */
  target: z.string().min(1),
  /**
   * Which instance, when the id repeats (elements rendered from a list share one id): its position
   * among the page's elements with that id. Omitted means the first.
   */
  index: z.number().int().nonnegative().optional(),
  /** What the user asked for, kept so the change can be revised later. */
  prompt: z.string().optional(),
};

export const HostPatchSchema = z.discriminatedUnion("op", [
  z.object({ ...base, op: z.literal("hide") }),
  z.object({ ...base, op: z.literal("insert"), position: z.enum(["before", "after"]), block: HostBlockSchema }),
  z.object({ ...base, op: z.literal("replace"), block: HostBlockSchema }),
]);
export type HostPatch = z.infer<typeof HostPatchSchema>;

/** POST /api/host/edit: turn a right-click and a sentence into a patch. */
export const HostEditRequestSchema = z.object({
  page: z.string(),
  element: HostElementSchema,
  prompt: z.string().min(1).max(2000),
  /** The instance clicked, when the element's id repeats (see HostPatch.index). */
  index: z.number().int().nonnegative().optional(),
  /** Set when revising an existing patch (right-clicked its generated UI). */
  current: HostPatchSchema.optional(),
});
export type HostEditRequest = z.infer<typeof HostEditRequestSchema>;

export type HostEditResponse =
  | { status: "applied"; patch: HostPatch; summary: string; css: string; attempts: number }
  | { status: "declined"; reason: string };

/** POST /api/host/data: run a saved patch's sources. */
export const HostDataRequestSchema = z.object({ id: z.string().min(1) });
export type HostDataResponse = {
  inputs: Record<string, { status: string; data: unknown; fetchedAt?: string; error?: string }>;
};

/** GET/PUT /api/host/patches: the saved patches and the CSS their classes need. */
export const HostPatchesSchema = z.object({ patches: z.array(HostPatchSchema) });
export type HostPatchesResponse = { patches: HostPatch[]; css: string };
