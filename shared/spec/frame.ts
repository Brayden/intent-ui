import { z } from "zod";

const FrameObjectSchema = z.object({
  /** "card" draws a bordered surface; "plain" renders content only. */
  style: z.enum(["card", "plain"]).default("card"),
  /** Show the block title in the header. */
  title: z.boolean().default(true),
  /** Show badges for the data sources behind the block. */
  sources: z.boolean().default(true),
  /** Show when the data was last updated. */
  freshness: z.boolean().default(true),
});

/**
 * A block's chrome, all user-controllable. Accepts the shorthand "card" | "plain" for
 * `{ style }` (plain blocks hide the rest of the chrome by default).
 */
export const BlockFrameSchema = z.preprocess(
  (value) =>
    value === "plain"
      ? { style: "plain", title: false, sources: false, freshness: false }
      : value === "card"
        ? { style: "card" }
        : value,
  FrameObjectSchema,
);
export type BlockFrame = z.infer<typeof FrameObjectSchema>;

/** Partial frame changes, for edits. No defaults: unspecified fields stay as they are. */
export const BlockFramePatchSchema = z.object({
  style: z.enum(["card", "plain"]).optional(),
  title: z.boolean().optional(),
  sources: z.boolean().optional(),
  freshness: z.boolean().optional(),
});
