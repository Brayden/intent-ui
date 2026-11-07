import { z } from "zod";
import type { CatalogSpec } from "./types";

/* Block chrome as placeable components (ADR 0007): same look and behavior as the frame's. */

export const BlockUpdatedPropsSchema = z.object({
  prefix: z.string().default("Updated "),
  size: z.enum(["xs", "sm"]).default("xs"),
});
export type BlockUpdatedProps = z.infer<typeof BlockUpdatedPropsSchema>;

export const BlockSourcesPropsSchema = z.object({});
export type BlockSourcesProps = z.infer<typeof BlockSourcesPropsSchema>;

export const blockUpdatedSpec: CatalogSpec = {
  type: "BlockUpdated",
  description:
    "This block's freshness label (\"Updated 3 minutes ago\", or a refreshing indicator while data reloads), identical to the one in the block header. Place it anywhere, e.g. in the toolbar; hide the header one with a frame patch (freshness: false).",
  props: BlockUpdatedPropsSchema,
};

export const blockSourcesSpec: CatalogSpec = {
  type: "BlockSources",
  description:
    "This block's data-source badges, identical to the ones in the block header. Place them anywhere; hide the header ones with a frame patch (sources: false).",
  props: BlockSourcesPropsSchema,
};
