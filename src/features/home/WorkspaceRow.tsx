import { Button } from "@cloudflare/kumo/components/button";
import { Text } from "@cloudflare/kumo/components/text";
import type { WorkspaceSummary } from "../../../shared/api";
import { navigate } from "../../app/router";
import { formatValue } from "../renderer/lib/format";

/** One saved workspace in the list: opens on click; delete on the right. */
export function WorkspaceRow({ workspace, onDelete }: { workspace: WorkspaceSummary; onDelete: () => void }) {
  const href = `/w/${workspace.id}`;
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-kumo-hairline bg-kumo-base p-4 transition hover:border-kumo-line">
      <a
        href={href}
        className="flex min-w-0 flex-1 flex-col gap-0.5"
        onClick={(event) => {
          event.preventDefault();
          navigate(href);
        }}
      >
        <Text bold>{workspace.title}</Text>
        <Text variant="secondary" size="sm">
          Edited {formatValue(workspace.updatedAt, "relative")}
        </Text>
      </a>
      <Button variant="ghost" size="sm" onClick={onDelete}>
        Delete
      </Button>
    </li>
  );
}
