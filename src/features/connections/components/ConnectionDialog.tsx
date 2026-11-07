import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Empty } from "@cloudflare/kumo/components/empty";
import { LayerDialog } from "@cloudflare/kumo/components/layer-dialog";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Switch } from "@cloudflare/kumo/components/switch";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Text } from "@cloudflare/kumo/components/text";
import { useEffect, useState } from "react";
import type { ActivityEntry, ConnectionSummary, ConnectionTool } from "../../../../shared/api";
import { formatValue } from "../../renderer/lib/format";
import { connectionActivity } from "../api";

import { useConfirm } from "../../../lib/confirm";

type ConnectionDialogProps = {
  connection: ConnectionSummary;
  onClose: () => void;
  onToolPolicy: (tool: string, policy: { enabled?: boolean; readOnly?: boolean }) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSignIn: () => void;
  onRemove: () => void;
};

/** One tool: on/off, and read vs write (correctable when the server didn't say). */
function ToolRow({ tool, editable, onPolicy }: { tool: ConnectionTool; editable: boolean; onPolicy: ConnectionDialogProps["onToolPolicy"] }) {
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const run = async (policy: { enabled?: boolean; readOnly?: boolean }) => {
    setBusy(true);
    await onPolicy(tool.name, policy).finally(() => setBusy(false));
  };
  return (
    <li className="flex items-start justify-between gap-4 border-b border-kumo-hairline py-3 last:border-0">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text bold>{tool.title ?? tool.name}</Text>
          <Badge variant={tool.readOnly ? "secondary" : tool.destructive ? "destructive" : "outline"}>
            {tool.readOnly ? "Read" : tool.destructive ? "Write · asks first" : "Write"}
          </Badge>
          {editable && tool.readOnlyBy !== "connection" && (!tool.annotated || !tool.readOnly || tool.readOnlyBy === "user") && (
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={async () => {
                // The server says this tool can change things: only the user can vouch that their credential can't.
                if (!tool.readOnly && tool.annotated) {
                  const ok = await confirm({
                    title: `Treat “${tool.name}” as read-only?`,
                    description:
                      "The server says this tool can change data. If you mark it read-only, workspaces can use it for page data, and the AI may call it while building. Only do this if your credential can only read (or reconnect this service with Read only access).",
                    action: "Treat as read-only",
                    destructive: true,
                  });
                  if (!ok) return;
                }
                await run({ readOnly: !tool.readOnly });
              }}
            >
              {tool.readOnly ? "Mark as write" : tool.annotated ? "Treat as read-only" : "Mark as read"}
            </Button>
          )}
        </div>
        {tool.description && (
          <Text variant="secondary" size="sm">
            {tool.description.length > 220 ? `${tool.description.slice(0, 220)}…` : tool.description}
          </Text>
        )}
      </div>
      <Switch
        label={tool.enabled ? "On" : "Off"}
        checked={tool.enabled}
        disabled={!editable || busy}
        onCheckedChange={(enabled) => void run({ enabled })}
      />
    </li>
  );
}

function ActivityList({ id }: { id: string }) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  useEffect(() => {
    connectionActivity(id).then(setEntries, () => setEntries([]));
  }, [id]);
  if (!entries) return <Loader />;
  if (entries.length === 0) return <Empty size="sm" title="No calls yet" description="Every call your workspaces make through this connection shows up here." />;
  return (
    <ul className="flex flex-col">
      {entries.map((entry, index) => (
        <li key={index} className="flex items-center justify-between gap-4 border-b border-kumo-hairline py-2 last:border-0">
          <div className="flex min-w-0 flex-col">
            <Text>
              {entry.tool} <Badge variant={entry.kind === "read" ? "secondary" : "outline"}>{entry.kind}</Badge>
            </Text>
            {entry.error && (
              <Text variant="error" size="sm">
                {entry.error}
              </Text>
            )}
          </div>
          <Text variant="secondary" size="sm">
            {entry.ok ? "OK" : "Failed"} · {entry.ms} ms · {formatValue(entry.at, "relative")}
          </Text>
        </li>
      ))}
    </ul>
  );
}

/**
 * Manage one connection: which tools workspaces may use (the gatekeeper's policy), what it's
 * been asked to do (activity), and sign-in. Built-ins are shown read-only.
 */
export function ConnectionDialog({ connection, onClose, onToolPolicy, onRefresh, onSignIn, onRemove }: ConnectionDialogProps) {
  const [tab, setTab] = useState("tools");
  const [refreshing, setRefreshing] = useState(false);
  const editable = !connection.builtin;
  const reads = connection.tools.filter((tool) => tool.readOnly);
  const writes = connection.tools.filter((tool) => !tool.readOnly);

  return (
    <LayerDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <LayerDialog.Content size="xl">
        <LayerDialog.Title>{connection.name}</LayerDialog.Title>
        <LayerDialog.Description>
          {connection.demo
            ? "Demo data: made-up sample data so the example workspace works. It isn't connected to any account."
            : connection.builtin
              ? "Built into Intent UI."
              : connection.url}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="flex flex-col gap-4">
            {editable && (
              <Text variant="secondary" size="sm">
                {connection.grantedReadOnly
                  ? "Read-only access: you chose Read & write, but the service granted only read permissions, so this connection can't change anything and every tool can be used for page data."
                  : connection.access === "read"
                  ? "Read-only access: this connection can't change anything, so every tool can be used for page data. To allow changes, reconnect it with Read & write access."
                  : "Read & write access: writes stay off until you turn them on, and only run when you click something. Reconnect with Read only access to use every tool for page data."}
              </Text>
            )}
            {connection.status !== "connected" && (
              <Banner
                variant={connection.status === "error" ? "error" : "alert"}
                title={connection.status === "needs_auth" ? "Sign in to use this connection" : "Couldn't reach this server"}
                description={connection.error}
              />
            )}
            {editable && (
              <Tabs
                variant="segmented"
                tabs={[
                  { value: "tools", label: `Tools (${connection.tools.length})` },
                  { value: "activity", label: "Activity" },
                ]}
                value={tab}
                onValueChange={setTab}
              />
            )}
            {tab === "tools" ? (
              connection.tools.length === 0 ? (
                <Empty size="sm" title="No tools yet" description="Connect or refresh to load this server's tools." />
              ) : (
                [
                  { label: "Read", tools: reads, hint: "Workspaces can show this data. On by default." },
                  { label: "Write", tools: writes, hint: "Only run when you click something in a workspace. Off until you turn them on." },
                ]
                  .filter((group) => group.tools.length > 0)
                  .map((group) => (
                    <section key={group.label} className="flex flex-col">
                      <Text bold>{group.label}</Text>
                      <Text variant="secondary" size="sm">
                        {group.hint}
                      </Text>
                      <ul className="flex flex-col">
                        {group.tools.map((tool) => (
                          <ToolRow key={tool.name} tool={tool} editable={editable} onPolicy={onToolPolicy} />
                        ))}
                      </ul>
                    </section>
                  ))
              )
            ) : (
              <ActivityList id={connection.id} />
            )}
            {editable && (
              <div className="flex flex-wrap justify-between gap-2 border-t border-kumo-hairline pt-4">
                <Button variant="secondary-destructive" onClick={onRemove}>
                  Disconnect
                </Button>
                <div className="flex gap-2">
                  {connection.auth === "oauth" && (
                    <Button variant="secondary" onClick={onSignIn}>
                      Sign in again
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    loading={refreshing}
                    onClick={() => {
                      setRefreshing(true);
                      void onRefresh().finally(() => setRefreshing(false));
                    }}
                  >
                    Refresh tools
                  </Button>
                </div>
              </div>
            )}
          </div>
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
