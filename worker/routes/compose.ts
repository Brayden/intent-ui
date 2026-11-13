import { ComposeRequestSchema } from "../../shared/api";
import { compose } from "../compose/compose";
import { composeStream } from "../compose/stream";
import { listTools } from "../connections/registry";
import type { Env } from "../env";
import { HttpError, readJson } from "../lib/http";
import { styles } from "../styles";
import { checkWorkspace } from "../workspaces/validate";
import { pickRoute } from "../../shared/spec";
import { loadOrThrow, type Params } from "./workspaces";

/** POST /api/workspaces/:id/compose */
export async function handleCompose(request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  const body = await readJson(request, ComposeRequestSchema);
  const stored = await loadOrThrow(env, id);
  // The client may be ahead of the last autosave; validate its spec like any save.
  const checked = await checkWorkspace(body.spec, stored.templates, styles);
  if (!("spec" in checked)) throw new HttpError(400, "Invalid workspace", checked.issues);
  const route = pickRoute(checked.spec.pages[body.pageId], body.route);
  // Progressive compose (ADR 0017): draft events as the model writes, then the same result.
  if (request.headers.get("accept")?.includes("text/event-stream")) {
    return composeStream(env, body.prompt, checked.spec, body.pageId, listTools(), styles, route);
  }
  return Response.json(await compose(env, body.prompt, checked.spec, body.pageId, listTools(), styles, route));
}
