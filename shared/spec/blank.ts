import type { z } from "zod";
import { WorkspaceSchema, SPEC_VERSION, type Workspace } from "./workspace";

export const BLANK_PAGE_ID = "home";

/** A new, empty workspace: one page with a centered column and a single slot to build into. */
export function blankWorkspace(title: string): Workspace {
  const spec: z.input<typeof WorkspaceSchema> = {
    specVersion: SPEC_VERSION,
    catalogVersion: "kumo@2.17",
    pages: {
      [BLANK_PAGE_ID]: {
        id: BLANK_PAGE_ID,
        title,
        layout: {
          root: "page",
          nodes: {
            page: { kind: "html", tag: "div", className: "mx-auto flex max-w-6xl flex-col gap-6 p-6", children: ["main"] },
            main: { kind: "slot", className: "flex flex-col gap-6" },
          },
        },
      },
    },
    blocks: {},
    sources: {},
  };
  return WorkspaceSchema.parse(spec);
}

/** A workspace's display title: its first page's title. */
export function workspaceTitle(workspace: Workspace): string {
  return Object.values(workspace.pages)[0]?.title ?? "Untitled";
}
