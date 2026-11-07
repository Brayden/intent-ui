import { Button } from "@cloudflare/kumo/components/button";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Text } from "@cloudflare/kumo/components/text";
import { useConfirm } from "../../lib/confirm";
import { useToasts } from "../../lib/useToasts";
import { useEffect, useState } from "react";
import type { WorkspaceSummary } from "../../../shared/api";
import { navigate } from "../../app/router";
import { ConnectionsSection } from "../connections";
import { teamExample } from "../examples";
import { createWorkspace, deleteWorkspace, listWorkspaces } from "../workspace";
import { WorkspaceRow } from "./WorkspaceRow";

/** Lists saved workspaces (start a blank one or the example), and the data connections they use. */
export function HomePage() {
  const toasts = useToasts();
  const confirm = useConfirm();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [creating, setCreating] = useState<"blank" | "example" | null>(null);

  useEffect(() => {
    listWorkspaces()
      .then(setWorkspaces)
      .catch((error: Error) => toasts.add({ title: "Couldn't load workspaces", description: error.message, variant: "error" }));
  }, [toasts]);

  const create = async (kind: "blank" | "example") => {
    setCreating(kind);
    try {
      const { id } = await createWorkspace(kind === "blank" ? { title: "Untitled workspace" } : { title: "My team", spec: teamExample });
      navigate(`/w/${id}`);
    } catch (error) {
      toasts.add({ title: "Couldn't create a workspace", description: (error as Error).message, variant: "error" });
      setCreating(null);
    }
  };

  const remove = async (workspace: WorkspaceSummary) => {
    const ok = await confirm({ title: `Delete “${workspace.title}”?`, description: "This can't be undone.", action: "Delete", destructive: true });
    if (!ok) return;
    try {
      await deleteWorkspace(workspace.id);
      setWorkspaces((current) => current?.filter((w) => w.id !== workspace.id) ?? null);
    } catch (error) {
      toasts.add({ title: "Couldn't delete", description: (error as Error).message, variant: "error" });
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Text variant="heading1" as="h1">
            Intent UI
          </Text>
          <Text variant="secondary">Apps that build themselves around what you ask for.</Text>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void create("example")} loading={creating === "example"} disabled={creating !== null}>
            Try the example
          </Button>
          <Button variant="primary" onClick={() => void create("blank")} loading={creating === "blank"} disabled={creating !== null}>
            New workspace
          </Button>
        </div>
      </header>
      {workspaces === null ? (
        <div className="flex justify-center p-12">
          <Loader size={20} />
        </div>
      ) : workspaces.length === 0 ? (
        <Empty title="No workspaces yet" description="Start a new one and describe what you need, or try the example." />
      ) : (
        <ul className="flex flex-col gap-2">
          {workspaces.map((workspace) => (
            <WorkspaceRow key={workspace.id} workspace={workspace} onDelete={() => void remove(workspace)} />
          ))}
        </ul>
      )}
      <ConnectionsSection />
    </div>
  );
}
