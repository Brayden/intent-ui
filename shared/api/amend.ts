import { z } from "zod";
import { BlockTreeSchema, LayoutTreeSchema } from "../spec/nodes";
import { BlockOpSchema, type BlockOp } from "../spec/ops";
import type { BlockData } from "../spec/composeChanges";
import type { PageChanges } from "../spec/pageChanges";
import type { Source } from "../spec/sources";
import type { BlockView, PageParam } from "../spec/workspace";
import { BlockContextSchema } from "./intents";

/**
 * POST /api/intents/amend — change what the user right-clicked (ADR 0004).
 * - "block": a component or the chrome of a page block (tree required; page changes allowed).
 * - "overlay": a component in a materialized overlay (tree required; no page changes).
 * - "page": a layout element (no tree; page changes only).
 */
export const AmendRequestSchema = z
  .object({
    prompt: z.string().min(1).max(2000),
    kind: z.enum(["block", "overlay", "page"]),
    target: z.object({
      /** Plain-language description of what was right-clicked, e.g. `data source badges of "Team members"`. */
      description: z.string(),
      /** Node id in `tree` (block/overlay) or in the page layout (page), when the target is a node. */
      nodeId: z.string().optional(),
    }),
    tree: BlockTreeSchema.optional(),
    block: BlockContextSchema.optional(),
    /** A small sample of the view model (arrays truncated), so the model knows available fields. */
    dataSample: z.unknown().optional(),
    /** The current `$item`, for overlays and list contexts. */
    item: z.unknown().optional(),
    /** The client's latest workspace spec: lets the edit change where data comes from (sources, views). */
    spec: z.unknown().optional(),
    /** The page's route values (ADR 0011), for dry runs of data changes. */
    route: z.record(z.string(), z.string()).default({}),
    /** The page layout and its blocks, so the edit can reshape the page (block and page kinds). */
    page: z
      .object({
        id: z.string(),
        layout: LayoutTreeSchema,
        /** The page's route params (ADR 0011), readable as $route.<name> in sources and views. */
        params: z.array(z.string()).default([]),
        blocks: z.array(
          z.object({
            id: z.string(),
            slot: z.string(),
            order: z.number(),
            title: z.string().optional(),
            frame: z.record(z.string(), z.unknown()),
          }),
        ),
      })
      .optional(),
  })
  .superRefine((request, ctx) => {
    if (request.kind !== "page" && !request.tree) ctx.addIssue({ code: "custom", message: `${request.kind} edits need a tree` });
    if (request.kind !== "overlay" && !request.page) ctx.addIssue({ code: "custom", message: `${request.kind} edits need the page` });
  });
export type AmendRequest = z.infer<typeof AmendRequestSchema>;

export type AmendResponse =
  | {
      status: "applied";
      ops: BlockOp[];
      page?: PageChanges;
      summary: string;
      attempts: number;
      /** Compiled CSS for the classes the change uses; inject before applying (ADR 0006). */
      css: string;
      /** Data changes for the target block: sources to add/replace, and its new inputs/view/fields. */
      data?: { sources: Source[]; block?: BlockData };
      /** Views from the server's dry run of a data change, so the result shows data immediately. */
      views?: Record<string, BlockView>;
      /** The page's new route params (e.g. an optional "q" for a search box, ADR 0013). */
      pageParams?: Record<string, PageParam>;
    }
  | { status: "declined"; reason: string };

export { BlockOpSchema };
