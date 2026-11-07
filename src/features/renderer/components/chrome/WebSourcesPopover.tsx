import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Link } from "@cloudflare/kumo/components/link";
import { Popover } from "@cloudflare/kumo/components/popover";
import { Text } from "@cloudflare/kumo/components/text";
import type { WebSourceMeta } from "../../../../../shared/spec";
import { useBlock, useDispatch } from "../../context";
import { formatValue } from "../../lib/format";

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** One web source: how it refreshes, when it was researched, and the pages it came from. */
function WebSourceEntry({ source }: { source: WebSourceMeta }) {
  const { block } = useBlock();
  const dispatch = useDispatch();
  const research = () =>
    void dispatch({ name: "research", params: { source: source.sourceId } }, { blockId: block.id, nodeId: block.root, scope: { root: {} } });

  return (
    <div className="flex flex-col gap-2">
      <Text variant="secondary" size="xs">
        {source.method === "fetch" ? "Fetched from the page each refresh" : `Researched ${formatValue(source.researchedAt, "relative")}`}
        {source.query ? ` · “${source.query}”` : ""}
      </Text>
      <ul className="flex flex-col gap-1">
        {source.citations.map((url) => (
          <li key={url} className="truncate">
            <Link href={url} target="_blank" rel="noopener noreferrer">
              {hostOf(url)}
            </Link>
          </li>
        ))}
      </ul>
      {source.method === "research" && (
        <Button size="sm" variant="secondary" onClick={research}>
          Refresh from the web
        </Button>
      )}
    </div>
  );
}

/** The "web" source pill: opens where the data came from, with a way to refresh it. */
export function WebSourcesPopover({ sources }: { sources: WebSourceMeta[] }) {
  return (
    <Popover.Root>
      <Popover.Trigger render={<button type="button" className="cursor-pointer rounded-full" aria-label="Web sources" />}>
        <Badge variant="outline">web</Badge>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner>
          <Popover.Popup className="flex w-72 flex-col gap-3 p-3">
            <Text variant="heading3" as="h3">
              From the web
            </Text>
            {sources.map((source) => (
              <WebSourceEntry key={source.sourceId} source={source} />
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
