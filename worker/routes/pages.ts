import { GeneratePageRequestSchema } from "../../shared/api";
import { listTools } from "../connections/registry";
import type { Env } from "../env";
import { HttpError, readJson } from "../lib/http";
import { generatePage } from "../pages/generate";
import { styles } from "../styles";
import { checkWorkspace } from "../workspaces/validate";
import { loadOrThrow, type Params } from "./workspaces";

/** POST /api/workspaces/:id/pages — generate the page an intent opens (ADR 0011). */
export async function handleGeneratePage(request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  const body = await readJson(request, GeneratePageRequestSchema);
  const stored = await loadOrThrow(env, id);
  const checked = await checkWorkspace(body.spec, stored.templates, styles);
  if (!("spec" in checked)) throw new HttpError(400, "Invalid workspace", checked.issues);
  return Response.json(await generatePage(env, body, checked.spec, listTools(), styles));
}
