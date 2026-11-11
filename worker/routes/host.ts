import { HostDataRequestSchema, HostEditRequestSchema, HostPatchesSchema, type HostDataResponse, type HostPatch, type HostPatchesResponse } from "../../shared/api";
import { listTools } from "../connections/registry";
import { runHostSources } from "../host/data";
import { HttpError } from "../lib/http";
import type { Env } from "../env";
import { editHost } from "../host/edit";
import { readJson } from "../lib/http";
import { styles } from "../styles";
import { allClasses, collectClasses } from "../styles/collect";
import { store } from "./workspaces";

/* Host customizations (the SDK's patch layer): one list per user, from the host's session. */
const patchStore = (env: Env) => store(env, `__host_patches__:${env.user}`);
const KEY = "host-patches";

async function loadPatches(env: Env): Promise<HostPatch[]> {
  const json = await patchStore(env).getCached(KEY);
  const parsed = HostPatchesSchema.safeParse(json ? JSON.parse(json) : { patches: [] });
  return parsed.success ? parsed.data.patches : [];
}

async function withCss(patches: HostPatch[]): Promise<HostPatchesResponse> {
  const trees = patches.flatMap((patch) => ("block" in patch ? [patch.block] : []));
  return { patches, css: trees.length > 0 ? await styles.css(allClasses(collectClasses(trees))) : "" };
}

/** GET /api/host/patches */
export async function getHostPatches(_request: Request, env: Env): Promise<Response> {
  return Response.json(await withCss(await loadPatches(env)));
}

/** PUT /api/host/patches: replaces the whole list (the SDK owns ordering and removal). */
export async function putHostPatches(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, HostPatchesSchema);
  await patchStore(env).putCached(KEY, JSON.stringify(body));
  return Response.json(await withCss(body.patches));
}

/** POST /api/host/edit */
export async function postHostEdit(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, HostEditRequestSchema);
  return Response.json(await editHost(env, body, listTools(), styles));
}

/**
 * POST /api/host/data: runs a saved customization's sources through the gatekeeper. Only saved
 * patches run, so a page can't ask the server to call arbitrary tools.
 */
export async function postHostData(request: Request, env: Env): Promise<Response> {
  const { id } = await readJson(request, HostDataRequestSchema);
  const patch = (await loadPatches(env)).find((p) => p.id === id);
  if (!patch || !("block" in patch)) throw new HttpError(404, `No customization "${id}"`);
  const results = await runHostSources(patch.block);
  const body: HostDataResponse = {
    inputs: Object.fromEntries(Object.entries(results).map(([alias, r]) => [alias, { status: r.status, data: r.data, fetchedAt: r.fetchedAt, error: r.error }])),
  };
  return Response.json(body);
}
