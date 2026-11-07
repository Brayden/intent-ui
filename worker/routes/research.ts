import { ResearchRefreshRequestSchema } from "../../shared/api";
import { listTools } from "../connections/registry";
import type { Env } from "../env";
import { HttpError, readJson } from "../lib/http";
import { refreshResearch } from "../research/refresh";
import { styles } from "../styles";
import { checkWorkspace } from "../workspaces/validate";
import { loadOrThrow, type Params } from "./workspaces";

/** POST /api/workspaces/:id/sources/:sourceId/research */
export async function handleResearchRefresh(request: Request, env: Env, { id = "", sourceId = "" }: Params): Promise<Response> {
  const body = await readJson(request, ResearchRefreshRequestSchema);
  const stored = await loadOrThrow(env, id);
  const checked = await checkWorkspace(body.spec, stored.templates, styles);
  if (!("spec" in checked)) throw new HttpError(400, "Invalid workspace", checked.issues);
  const source = checked.spec.sources[sourceId];
  if (source?.kind !== "research") throw new HttpError(400, `"${sourceId}" isn't researched data`);
  return Response.json(await refreshResearch(env, source, listTools()));
}
