import { CommandPalette } from "@cloudflare/kumo/components/command-palette";
import { Text } from "@cloudflare/kumo/components/text";
import { ArrowClockwiseIcon, FileIcon, FolderIcon, HouseIcon, MagicWandIcon, PlusIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { WorkspaceSummary } from "../../../shared/api";
import type { Page } from "../../../shared/spec";
import { useAppPaths } from "../../app/paths";
import { navigate } from "../../app/router";
import { createWorkspace, listWorkspaces } from "../workspace/api";
import { buildCommandGroups, type Command, type CommandGroup } from "./commands";

type CommandMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** Pages of this workspace to offer (ones that need no route params). */
  pages: Page[];
  onOpenPage: (pageId: string) => void;
  /** Builds from a prompt (the AI compose flow). The menu closes as soon as it starts. */
  onGenerate: (prompt: string) => Promise<boolean>;
  onRefresh: () => void;
  /** Placeholder for the input, e.g. "Describe what you want to build…". */
  placeholder: string;
  /** Shown in the footer, e.g. "All changes saved". */
  status?: string;
};

/**
 * The workspace's one piece of app chrome (⌘K): type what you want and press Enter to have it
 * generated, or pick an action or another workspace. Built on Kumo `CommandPalette`.
 */
export function CommandMenu({ open, onOpenChange, workspaceId, pages, onOpenPage, onGenerate, onRefresh, placeholder, status }: CommandMenuProps) {
  const [query, setQuery] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  // Embedded in a host (no home), the menu is about this page only: no workspace switching.
  const { home } = useAppPaths();

  useEffect(() => {
    if (!open || home === null) return;
    let cancelled = false;
    listWorkspaces()
      .then((list) => !cancelled && setWorkspaces(list))
      .catch(() => !cancelled && setWorkspaces([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const groups = useMemo<CommandGroup[]>(() => {
    const close = (then: () => void) => () => {
      onOpenChange(false);
      then();
    };
    const actions: Command[] = [
      { id: "refresh", title: "Refresh data", description: "Re-run this page's data sources", icon: <ArrowClockwiseIcon />, run: close(onRefresh) },
      ...(home === null
        ? []
        : [
            {
              id: "new",
              title: "New blank workspace",
              icon: <PlusIcon />,
              run: close(() => void createWorkspace({ title: "Untitled workspace" }).then(({ id }) => navigate(`/w/${id}`))),
            },
            { id: "home", title: "All workspaces", description: "Manage and delete workspaces", icon: <HouseIcon />, run: close(() => navigate(home)) },
          ]),
    ];
    return buildCommandGroups({
      query,
      generate: {
        description: "Generate with AI",
        icon: <MagicWandIcon />,
        run: () => {
          const prompt = query.trim();
          onOpenChange(false);
          // Keep the text if it fails, so reopening the menu lets you retry or tweak it.
          void onGenerate(prompt).then((done) => done && setQuery(""));
        },
      },
      actions,
      pages: pages.map((page) => ({ id: `page:${page.id}`, title: page.title, icon: <FileIcon />, run: close(() => onOpenPage(page.id)) })),
      workspaces,
      currentWorkspaceId: workspaceId,
      openWorkspace: (workspace) => close(() => navigate(`/w/${workspace.id}`))(),
      workspaceIcon: <FolderIcon />,
    });
  }, [query, workspaces, workspaceId, pages, onOpenPage, onGenerate, onRefresh, onOpenChange, home]);

  return (
    <CommandPalette.Root
      open={open}
      onOpenChange={onOpenChange}
      items={groups}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={(group) => group.label}
      getSelectableItems={(all) => all.flatMap((group) => group.items)}
      onSelect={(item: Command) => item.run()}
    >
      <CommandPalette.Input placeholder={placeholder} aria-label="Describe what you want, or search" />
      <CommandPalette.List>
        <CommandPalette.Results>
          {(group: CommandGroup) => (
            <CommandPalette.Group key={group.label} items={group.items}>
              <CommandPalette.GroupLabel>{group.label}</CommandPalette.GroupLabel>
              <CommandPalette.Items>
                {(item: Command) => (
                  <CommandPalette.ResultItem
                    key={item.id}
                    value={item}
                    title={item.title}
                    description={item.description}
                    icon={item.icon}
                    onClick={() => item.run()}
                  />
                )}
              </CommandPalette.Items>
            </CommandPalette.Group>
          )}
        </CommandPalette.Results>
        <CommandPalette.Empty>Type what you want to build</CommandPalette.Empty>
      </CommandPalette.List>
      <CommandPalette.Footer>
        <div className="flex w-full items-center justify-between gap-4">
          <Text variant="secondary" size="xs">
            ↵ generate or select · esc close
          </Text>
          {status && (
            <Text variant="secondary" size="xs">
              {status}
            </Text>
          )}
        </div>
      </CommandPalette.Footer>
    </CommandPalette.Root>
  );
}
