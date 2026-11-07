import { MaterializeRequestSchema } from "../../shared/api";
import { listTools } from "../connections/registry";
import type { Env } from "../env";
import { readJson } from "../lib/http";
import { styles } from "../styles";
import { materialize } from "../intents/materialize";

/** POST /api/intents/materialize */
export async function handleMaterialize(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, MaterializeRequestSchema);
  return Response.json(await materialize(env, body, listTools(), styles));
}
