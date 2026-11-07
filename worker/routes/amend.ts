import { AmendRequestSchema } from "../../shared/api";
import { amend } from "../amend/amend";
import { listTools } from "../connections/registry";
import type { Env } from "../env";
import { readJson } from "../lib/http";
import { styles } from "../styles";

/** POST /api/intents/amend */
export async function handleAmend(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, AmendRequestSchema);
  return Response.json(await amend(env, body, listTools(), styles));
}
