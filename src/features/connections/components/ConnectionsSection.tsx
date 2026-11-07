import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Text } from "@cloudflare/kumo/components/text";
import { useCallback, useEffect, useState } from "react";
import type { ConnectionSummary, CreateConnectionRequest } from "../../../../shared/api";
import { useConfirm } from "../../../lib/confirm";
import { useToasts } from "../../../lib/useToasts";
import { addConnection, listConnections, reauthorize, refreshConnection, removeConnection, setToolPolicy } from "../api";
import { AddConnectionDialog } from "./AddConnectionDialog";
import { ConnectionDialog } from "./ConnectionDialog";

const STATUS: Record<ConnectionSummary["status"], { label: string; variant: "success" | "warning" | "error" }> = {
  connected: { label: "Connected", variant: "success" },
  needs_auth: { label: "Needs sign-in", variant: "warning" },
  error: { label: "Error", variant: "error" },
};

/** Reads (and clears) the result of an OAuth sign-in from the URL the callback sent us to. */
function takeOAuthResult(): { connection: string; status: string; message: string } | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("status")) return null;
  window.history.replaceState(null, "", window.location.pathname);
  return { connection: params.get("connection") ?? "", status: params.get("status") ?? "", message: params.get("message") ?? "" };
}

type RowProps = { connection: ConnectionSummary; onManage: () => void; onConnectReal?: () => void };

/** What a row says about a connection: yours (live status), demo data, or built in. */
function describe(connection: ConnectionSummary): { badge: string; variant: "success" | "warning" | "error" | "neutral" | "outline"; detail: string } {
  const tools = `${connection.tools.length} tool${connection.tools.length === 1 ? "" : "s"}`;
  if (connection.replacedBy) return { badge: "Replaced by yours", variant: "outline", detail: "Your own connection is used instead." };
  if (connection.demo) {
    return {
      badge: "Demo data",
      variant: "neutral",
      detail: `Sample data so the example works, not your account.${connection.preset ? " Connect yours to replace it." : ""}`,
    };
  }
  if (connection.builtin) return { badge: "Built in", variant: "neutral", detail: `Public web pages and APIs · ${tools}` };
  const status = STATUS[connection.status];
  const enabled = connection.tools.filter((tool) => tool.enabled).length;
  const error = connection.status !== "connected" && connection.error ? ` · ${connection.error}` : "";
  const access = connection.access === "read" ? "Read only" : "Read & write";
  return { badge: status.label, variant: status.variant, detail: `${access} · ${enabled} of ${connection.tools.length} tools on${error}` };
}

function ConnectionRow({ connection, onManage, onConnectReal }: RowProps) {
  const { badge, variant, detail } = describe(connection);
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-kumo-hairline bg-kumo-base p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Text bold>{connection.name}</Text>
          <Badge variant={variant}>{badge}</Badge>
        </div>
        <Text variant="secondary" size="sm">
          {detail}
        </Text>
      </div>
      <div className="flex shrink-0 gap-2">
        {onConnectReal && (
          <Button variant="primary" size="sm" onClick={onConnectReal}>
            Connect yours
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onManage}>
          {connection.builtin ? "View" : "Manage"}
        </Button>
      </div>
    </li>
  );
}

/**
 * The home page's data connections (ADR 0014): yours first (GitHub, Linear, Cloudflare, any MCP
 * server), then the built-ins (web, demo data). A connected GitHub or Linear replaces its demo.
 */
export function ConnectionsSection() {
  const toasts = useToasts();
  const confirm = useConfirm();
  const [connections, setConnections] = useState<ConnectionSummary[] | null>(null);
  /** The add dialog: closed (false), open at the service list (true), or open at one preset. */
  const [adding, setAdding] = useState<boolean | string>(false);
  const [managing, setManaging] = useState<string | null>(null);

  const load = useCallback(
    () =>
      listConnections()
        .then(setConnections)
        .catch((error: Error) => toasts.add({ title: "Couldn't load connections", description: error.message, variant: "error" })),
    [toasts],
  );

  useEffect(() => {
    const result = takeOAuthResult();
    if (result?.status === "connected") toasts.add({ title: "Connected", description: "Its tools are now available to your workspaces.", variant: "success" });
    else if (result) toasts.add({ title: "Couldn't connect", description: result.message || "Sign-in didn't complete.", variant: "error" });
    void load();
  }, [load, toasts]);

  const replace = (next: ConnectionSummary) =>
    // Only your connection: a demo with the same id (one it replaced) stays as is.
    setConnections((current) => current?.map((connection) => (connection.id === next.id && !connection.builtin ? next : connection)) ?? null);

  const add = async (request: CreateConnectionRequest) => {
    const { connection, authUrl } = await addConnection(request);
    if (authUrl) {
      window.location.assign(authUrl); // back to /?status=… after signing in
      return;
    }
    setAdding(false);
    await load();
    if (connection.status === "connected") toasts.add({ title: `${connection.name} connected`, description: `${connection.tools.length} tools found.`, variant: "success" });
    else toasts.add({ title: `Couldn't connect ${connection.name}`, description: connection.error, variant: "error" });
  };

  const signIn = async (id: string) => {
    try {
      window.location.assign((await reauthorize(id)).authUrl);
    } catch (error) {
      toasts.add({ title: "Couldn't start sign-in", description: (error as Error).message, variant: "error" });
    }
  };

  const remove = async (connection: ConnectionSummary) => {
    const ok = await confirm({
      title: `Disconnect ${connection.name}?`,
      description: "Its credentials are deleted. Workspaces that use its data will show errors until you connect it again.",
      action: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    await removeConnection(connection.id);
    setManaging(null);
    await load();
  };

  const mine = connections?.filter((connection) => !connection.builtin) ?? [];
  const builtins = connections?.filter((connection) => connection.builtin) ?? [];
  const keyOf = (connection: ConnectionSummary) => `${connection.builtin ? "builtin" : "mine"}:${connection.id}`;
  const managed = connections?.find((connection) => keyOf(connection) === managing);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Text variant="heading3" as="h2">
            Connections
          </Text>
          <Text variant="secondary" size="sm">
            Data your workspaces can use. You decide which tools are on; writes only run when you click something.
          </Text>
        </div>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Add connection
        </Button>
      </div>
      {connections === null ? (
        <Loader />
      ) : (
        <>
          {mine.length === 0 ? (
            <div className="rounded-lg border border-dashed border-kumo-line p-4">
              <Text variant="secondary" size="sm">
                You haven't connected anything yet. Add GitHub, Linear, Cloudflare, or any MCP server to use your own data.
              </Text>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {mine.map((connection) => (
                <ConnectionRow key={keyOf(connection)} connection={connection} onManage={() => setManaging(keyOf(connection))} />
              ))}
            </ul>
          )}
          <Text variant="secondary" size="sm" bold>
            Built in
          </Text>
          <ul className="flex flex-col gap-2">
            {builtins.map((connection) => (
              <ConnectionRow
                key={keyOf(connection)}
                connection={connection}
                onManage={() => setManaging(keyOf(connection))}
                onConnectReal={connection.demo && connection.preset && !connection.replacedBy ? () => setAdding(connection.preset ?? true) : undefined}
              />
            ))}
          </ul>
        </>
      )}
      {adding !== false && (
        <AddConnectionDialog initialPreset={typeof adding === "string" ? adding : undefined} onClose={() => setAdding(false)} onSubmit={add} />
      )}
      {managed && (
        <ConnectionDialog
          connection={managed}
          onClose={() => setManaging(null)}
          onToolPolicy={async (tool, policy) => {
            try {
              replace(await setToolPolicy(managed.id, tool, policy));
            } catch (error) {
              toasts.add({ title: "Couldn't update the tool", description: (error as Error).message, variant: "error" });
            }
          }}
          onRefresh={async () => {
            const next = await refreshConnection(managed.id);
            replace(next);
            if (next.status !== "connected") toasts.add({ title: "Couldn't refresh", description: next.error, variant: "error" });
          }}
          onSignIn={() => void signIn(managed.id)}
          onRemove={() => void remove(managed)}
        />
      )}
    </section>
  );
}
