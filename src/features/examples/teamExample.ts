import type { z } from "zod";
import { WorkspaceSchema } from "../../../shared/spec";
import { teamTable } from "./teamTable";

type StatInput = { alias: string; source: string };

/** A single-Stat block in the side rail that counts one input. */
const statBlock = (id: string, order: number, label: string, hint: string, input: StatInput, requires: string[]) => ({
  id, page: "team", slot: "side", order, frame: "plain" as const,
  inputs: { [input.alias]: input.source },
  view: { expr: `{ 'value': $count($${input.alias}) }`, schema: { type: "object" } },
  root: "stat",
  nodes: { stat: { type: "Stat", props: { label, value: { path: "/value" }, hint, requires } } },
});

/**
 * Example workspace (RFC 0002 §5.5): a team directory on the demo HR connection, so "Try the
 * example" works without accounts. Connect GitHub or Linear and ask to add their work to it.
 */
const spec: z.input<typeof WorkspaceSchema> = {
  specVersion: 0,
  catalogVersion: "kumo@2.17",
  pages: {
    team: {
      id: "team",
      title: "My team",
      layout: {
        root: "page",
        nodes: {
          page: { kind: "html", tag: "div", className: "mx-auto flex max-w-6xl flex-col gap-6 p-6", children: ["header", "body"] },
          header: { kind: "html", tag: "header", className: "flex items-end justify-between gap-4", children: ["heading", "actions"] },
          heading: { kind: "html", tag: "div", className: "flex flex-col gap-1", children: ["title", "subtitle"] },
          title: { kind: "html", tag: "h1", className: "text-2xl font-semibold text-kumo-default", text: "My team" },
          subtitle: { kind: "html", tag: "p", className: "text-sm text-kumo-subtle", text: "Your direct reports (demo HR data)" },
          actions: { kind: "slot", className: "flex items-center gap-2" },
          // A custom grid template: wide table, fixed-width stats rail on large screens.
          body: { kind: "html", tag: "div", className: "grid grid-cols-1 gap-6", grid: { columns: { lg: "minmax(0, 1fr) 16rem" } }, children: ["main", "side"] },
          main: { kind: "slot", className: "flex flex-col gap-6" },
          side: { kind: "slot", className: "flex flex-col gap-4" },
        },
      },
    },
  },
  sources: {
    "hr.directReports": {
      kind: "tool", id: "hr.directReports", connection: "acme-hr", tool: "list_direct_reports",
      args: { managerId: "me" },
      normalize: "employees.{ 'id': id, 'name': full_name, 'title': job_title, 'email': work_email }",
      key: "id", schema: { type: "array" },
    },
  },
  blocks: {
    // Generated when the user asked for "a refresh button" (RFC 0002 §7.1).
    "refresh-button": {
      id: "refresh-button", page: "team", slot: "actions", order: 0, frame: "plain",
      view: { expr: "{}", schema: { type: "object" } },
      root: "button",
      nodes: { button: { type: "Button", props: { label: "Refresh" }, action: { name: "refresh", params: { page: "team" } } } },
    },
    "team-table": teamTable,
    "stat-members": statBlock("stat-members", 0, "Team members", "Direct reports in Acme HR",
      { alias: "members", source: "hr.directReports" }, ["members"]),
  },
};

export const teamExample = WorkspaceSchema.parse(spec);
