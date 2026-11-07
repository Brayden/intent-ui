import { z } from "zod";
import { HttpError } from "../../lib/http";
import type { Connection } from "../types";

/*
 * DEV FIXTURE — a fake HR directory so the example workspace has a real write path.
 * Delete together with src/features/preview once real MCP connections land.
 * State is in memory and resets when the dev server restarts.
 */

type Employee = { id: string; full_name: string; job_title: string; work_email: string };

const employees = new Map<string, Employee>(
  [
    { id: "emp_1", full_name: "Ana Kim", job_title: "Staff Engineer", work_email: "ana@acme.dev" },
    { id: "emp_2", full_name: "Ravi Patel", job_title: "Senior Engineer", work_email: "ravi@acme.dev" },
    { id: "emp_3", full_name: "Jordan Doe", job_title: "Engineer", work_email: "jordan@acme.dev" },
    { id: "emp_4", full_name: "Mei Lin", job_title: "Product Designer", work_email: "mei@acme.dev" },
    { id: "emp_5", full_name: "Sam Ortiz", job_title: "Engineering Intern", work_email: "sam@acme.dev" },
  ].map((employee) => [employee.id, employee]),
);

const IdArgs = z.object({ id: z.string() });
const UpdateArgs = IdArgs.extend({
  full_name: z.string().min(1).optional(),
  job_title: z.string().min(1).optional(),
  work_email: z.email().optional(),
});

function find(id: string): Employee {
  const employee = employees.get(id);
  if (!employee) throw new HttpError(404, `No employee with id ${id}`);
  return employee;
}

function parse<T>(schema: z.ZodType<T>, args: unknown): T {
  const parsed = schema.safeParse(args);
  if (!parsed.success) throw new HttpError(400, "Invalid tool arguments", parsed.error.issues.map((i) => i.message));
  return parsed.data;
}

export const acmeHr: Connection = {
  id: "acme-hr",
  name: "Acme HR (demo data)",
  tools: [
    { connection: "acme-hr", name: "list_direct_reports", description: "List the current user's direct reports. Returns { employees: [{ id, full_name, job_title, work_email }] }.", readOnly: true, inputSchema: { type: "object", properties: {} } },
    { connection: "acme-hr", name: "get_employee", description: "Get one employee by id.", readOnly: true, inputSchema: z.toJSONSchema(IdArgs) },
    { connection: "acme-hr", name: "update_employee", description: "Update an employee's name, job title, or work email. Only provided fields change.", readOnly: false, inputSchema: z.toJSONSchema(UpdateArgs) },
  ],
  async call(tool, args) {
    if (tool === "list_direct_reports") return { employees: [...employees.values()] };
    if (tool === "get_employee") return find(parse(IdArgs, args).id);
    if (tool === "update_employee") {
      const { id, ...changes } = parse(UpdateArgs, args);
      const updated = { ...find(id), ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) };
      employees.set(id, updated);
      return updated;
    }
    throw new HttpError(404, `Unknown tool ${tool}`);
  },
};
