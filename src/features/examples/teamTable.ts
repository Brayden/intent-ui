import type { z } from "zod";
import type { BlockSchema } from "../../../shared/spec";

const VIEW_EXPR = `{ 'rows': [$members.{ 'id': id, 'name': name, 'title': title, 'email': email }] }`;

const intent = (id: string, prompt: string) => ({
  name: "intent" as const,
  params: { id, prompt, item: { path: "$item/id" } },
});

/** The team table block: direct reports from the demo HR connection. */
export const teamTable: z.input<typeof BlockSchema> = {
  id: "team-table", page: "team", slot: "main", order: 0, title: "Team members",
  inputs: { members: "hr.directReports" },
  view: { expr: VIEW_EXPR, schema: { type: "object" } },
  root: "table",
  nodes: {
    table: { type: "DataTable", props: { rows: { path: "/rows" }, rowKey: "id", requires: ["members"] }, children: ["col-name", "col-email", "col-actions"] },
    "col-name": { type: "DataColumn", props: { header: "Name", field: "name", subField: "title" } },
    "col-email": { type: "DataColumn", props: { header: "Email", field: "email" } },
    "col-actions": { type: "DataColumn", props: { align: "right" }, children: ["row-menu"] },
    "row-menu": { type: "ActionMenu", props: { label: "Member actions" }, children: ["menu-edit", "menu-profile", "menu-remove"] },
    "menu-edit": { type: "MenuItem", props: { label: "Edit" }, action: intent("edit-team-member", "Edit this team member's name and job title") },
    "menu-profile": { type: "MenuItem", props: { label: "View profile" }, action: intent("view-profile", "Show this person's profile") },
    "menu-remove": { type: "MenuItem", props: { label: "Remove from team", variant: "danger" }, action: intent("remove-member", "Remove this person from my team") },
  },
};
