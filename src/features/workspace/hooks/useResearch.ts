import { useCallback } from "react";
import type { ResearchRefreshResponse } from "../../../../shared/api";
import type { Source, Workspace } from "../../../../shared/spec";
import { useToasts } from "../../../lib/useToasts";
import { refreshResearch } from "../api";

type ResearchOptions = {
  workspaceId: string;
  latest: () => Workspace;
  flush: () => Promise<void>;
  onSource: (source: Source) => void;
  onRefresh: () => Promise<void>;
};

const describe = ({ diff, promoted }: ResearchRefreshResponse) => {
  const parts = [`${diff.total} rows`];
  if (diff.added) parts.push(`${diff.added} new`);
  if (diff.changed) parts.push(`${diff.changed} changed`);
  if (diff.removed) parts.push(`${diff.removed} removed`);
  if (!diff.added && !diff.changed && !diff.removed) parts.push("no changes");
  return `${parts.join(" · ")}${promoted ? ". Found a structured page for this, so future refreshes are instant." : ""}`;
};

/**
 * Re-researches a web source (ADR 0009 tier 2): replays its recipe on the server, then applies the
 * result. Big changes (rows dropping, most rows replaced) are shown for confirmation first.
 */
export function useResearch({ workspaceId, latest, flush, onSource, onRefresh }: ResearchOptions) {
  const toasts = useToasts();
  return useCallback(
    (sourceId: string) => {
      const apply = (result: ResearchRefreshResponse) => {
        onSource(result.source);
        // Let autosave pick up the new source, then recompute views from it.
        setTimeout(() => void flush().then(onRefresh), 0);
        toasts.add({ title: "Refreshed from the web", description: describe(result), variant: "success" });
      };
      const run = async () => {
        await flush();
        const result = await toasts.promise(refreshResearch(workspaceId, sourceId, { spec: latest() }), {
          loading: { title: "Researching…", description: "Searching the web for the latest data." },
          success: { title: "Research done" },
          error: (error: Error) => ({ title: "Couldn't refresh from the web", description: error.message, variant: "error" }),
        });
        if (result.warnings.length === 0) return apply(result);
        toasts.add({
          title: "Big change: review before applying",
          description: `${result.warnings.join(" ")} ${describe(result)}`,
          variant: "warning",
          actions: [{ children: "Apply anyway", onClick: () => apply(result) }],
        });
      };
      void run().catch(() => undefined); // errors are shown by the toast
    },
    [workspaceId, latest, flush, onSource, onRefresh, toasts],
  );
}
