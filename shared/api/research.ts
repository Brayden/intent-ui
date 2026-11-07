import { z } from "zod";
import type { Source } from "../spec/sources";

/** POST /api/workspaces/:id/sources/:sourceId/research — refresh researched data (ADR 0009). */
export const ResearchRefreshRequestSchema = z.object({
  /** The client's latest spec (may include unsaved edits); validated like any save. */
  spec: z.unknown(),
});
export type ResearchRefreshRequest = z.input<typeof ResearchRefreshRequestSchema>;

/** What changed between the previous and the refreshed rows, by key. */
export type ResearchDiff = { added: number; removed: number; changed: number; total: number };

export type ResearchRefreshResponse = {
  /** The refreshed source: the same research source with new rows, or a tier-1 web fetch it was promoted to. */
  source: Source;
  diff: ResearchDiff;
  /** Large or suspicious changes; the client asks before applying when there are any. */
  warnings: string[];
  promoted: boolean;
};
