import type { ReactNode } from "react";
import type { WorkspaceSummary } from "../../../shared/api";

/** One selectable row in the command menu. */
export type Command = { id: string; title: string; description?: string; icon?: ReactNode; run: () => void };
export type CommandGroup = { label: string; items: Command[] };

const matches = (query: string, ...texts: (string | undefined)[]) => {
  const q = query.trim().toLowerCase();
  return q === "" || texts.some((text) => text?.toLowerCase().includes(q));
};

type BuildOptions = {
  query: string;
  /** The "generate this" row, shown first whenever there's text. */
  generate: Omit<Command, "id" | "title"> | null;
  actions: Command[];
  /** This workspace's other pages. */
  pages: Command[];
  workspaces: WorkspaceSummary[] | null;
  currentWorkspaceId: string;
  openWorkspace: (workspace: WorkspaceSummary) => void;
  workspaceIcon?: ReactNode;
};

/**
 * The menu's groups for a query: generate (any text), then matching actions, this workspace's
 * pages, then other workspaces. Empty groups are dropped.
 */
export function buildCommandGroups({ query, generate, actions, pages, workspaces, currentWorkspaceId, openWorkspace, workspaceIcon }: BuildOptions): CommandGroup[] {
  const text = query.trim();
  const groups: CommandGroup[] = [];
  if (text && generate) groups.push({ label: "Generate", items: [{ id: "generate", title: text, ...generate }] });
  groups.push({ label: "Actions", items: actions.filter((action) => matches(query, action.title, action.description)) });
  groups.push({ label: "Pages", items: pages.filter((page) => matches(query, page.title)) });
  const others = (workspaces ?? [])
    .filter((workspace) => workspace.id !== currentWorkspaceId && matches(query, workspace.title))
    .map((workspace) => ({
      id: `workspace:${workspace.id}`,
      title: workspace.title,
      description: `Edited ${new Date(workspace.updatedAt).toLocaleDateString()}`,
      icon: workspaceIcon,
      run: () => openWorkspace(workspace),
    }));
  groups.push({ label: "Workspaces", items: others });
  return groups.filter((group) => group.items.length > 0);
}
