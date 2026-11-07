import { Badge } from "@cloudflare/kumo/components/badge";
import type { WebSourceMeta } from "../../../../../shared/spec";
import { WebSourcesPopover } from "./WebSourcesPopover";

/**
 * Badges for the data sources behind a block. Web-sourced data gets a clickable "web" pill with
 * its citations and refresh (ADR 0009). Shared by the frame and the BlockSources component.
 */
export function SourceBadges({ sources, web = [] }: { sources: string[]; web?: WebSourceMeta[] }) {
  const others = sources.filter((source) => source !== "web");
  if (others.length === 0 && web.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {others.map((source) => (
        <Badge key={source} variant="outline">
          {source}
        </Badge>
      ))}
      {web.length > 0 && <WebSourcesPopover sources={web} />}
    </span>
  );
}
