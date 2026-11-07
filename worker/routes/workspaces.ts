import {
  applyChange,
  ChangeSchema,
  IAP_VERSION,
  type IapDocument,
  CreateWorkspaceRequestSchema,
  PutTemplateRequestSchema,
  RefreshRequestSchema,
  SaveWorkspaceRequestSchema,
  type PutTemplateResponse,
  type RefreshResponse,
  type SaveWorkspaceResponse,
  type WorkspaceResponse,
} from "../../shared/api";
import { blankWorkspace, pickRoute, workspaceTitle } from "../../shared/spec";
import { computePage } from "../data/views";
import { listTools } from "../connections/registry";
import { routeResearch } from "../research/routeResearch";
import type { Env } from "../env";
import { HttpError, readJson } from "../lib/http";
import { styles } from "../styles";
import type { StoredWorkspace } from "../store/WorkspaceStore";
import { checkWorkspace, parseTemplate } from "../workspaces/validate";

export type Params = Record<string, string>;

export const store = (env: Env, id: string) => env.WORKSPACES.get(env.WORKSPACES.idFromName(id));
const directory = (env: Env) => env.DIRECTORY.get(env.DIRECTORY.idFromName("directory"));

/** Loads a stored workspace or throws a 404. */
export async function loadOrThrow(env: Env, id: string): Promise<StoredWorkspace> {
  const json = await store(env, id).load();
  if (!json) throw new HttpError(404, `No workspace "${id}"`);
  return JSON.parse(json) as StoredWorkspace;
}

/** GET /api/workspaces */
export async function listWorkspaces(_request: Request, env: Env): Promise<Response> {
  return Response.json(await directory(env).list());
}

/** POST /api/workspaces */
export async function createWorkspace(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, CreateWorkspaceRequestSchema);
  const checked = await checkWorkspace(body.spec ?? blankWorkspace(body.title), [], styles);
  if (!("spec" in checked)) throw new HttpError(400, "Invalid workspace", checked.issues);
  const id = crypto.randomUUID();
  await store(env, id).init(JSON.stringify(checked.spec), checked.css);
  await directory(env).touch(id, workspaceTitle(checked.spec));
  return Response.json({ id }, { status: 201 });
}

/** GET /api/workspaces/:id */
export async function getWorkspace(_request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  const body: WorkspaceResponse = { id, ...(await loadOrThrow(env, id)) };
  return Response.json(body);
}

/** PUT /api/workspaces/:id — validated autosave with optimistic concurrency. */
export async function saveWorkspace(request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  const body = await readJson(request, SaveWorkspaceRequestSchema);
  const stored = await loadOrThrow(env, id);
  const checked = await checkWorkspace(body.spec, stored.templates, styles);
  if (!("spec" in checked)) throw new HttpError(400, "Invalid workspace", checked.issues);
  const result = await store(env, id).save(JSON.stringify(checked.spec), body.baseVersion, body.summary, checked.css);
  if (!result.ok) return Response.json({ error: "This workspace changed elsewhere", version: result.version }, { status: 409 });
  await directory(env).touch(id, workspaceTitle(checked.spec));
  const response: SaveWorkspaceResponse = { version: result.version, css: checked.css };
  return Response.json(response);
}

/** POST /api/workspaces/:id/data — run the page's sources, compute views, keep snapshots. */
export async function refreshData(request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  const { pageId, route, blocks } = await readJson(request, RefreshRequestSchema);
  const stored = await loadOrThrow(env, id);
  const page = stored.spec.pages[pageId];
  const resolve = routeResearch(env, store(env, id), listTools());
  const { views } = await computePage(stored.spec, pageId, pickRoute(page, route), { resolveResearch: resolve }, blocks);
  // Pages with params show different data per URL, so their views aren't saved as snapshots.
  if (page && Object.keys(page.params).length === 0) await store(env, id).saveViews(JSON.stringify({ ...stored.views, ...views }));
  const body: RefreshResponse = { views };
  return Response.json(body);
}

/** POST /api/workspaces/:id/templates */
export async function putTemplate(request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  const body = await readJson(request, PutTemplateRequestSchema);
  const template = parseTemplate(body.template);
  if ("issues" in template) throw new HttpError(400, "Invalid template", template.issues);
  const stored = await loadOrThrow(env, id);
  const templates = [...stored.templates.filter((t) => t.id !== template.id), template];
  const checked = await checkWorkspace(stored.spec, templates, styles);
  if (!("spec" in checked)) throw new HttpError(400, "Invalid template", checked.issues);
  await store(env, id).putTemplate(template.id, JSON.stringify(template), body.aliasKey, checked.css);
  const response: PutTemplateResponse = { css: checked.css };
  return Response.json(response);
}

/** DELETE /api/workspaces/:id */
export async function deleteWorkspace(_request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  await store(env, id).destroy();
  await directory(env).remove(id);
  return new Response(null, { status: 204 });
}

/** The stored workspace as a portable IAP document (RFC 0003 §3). */
function toDocument(stored: StoredWorkspace): IapDocument {
  return { iap: IAP_VERSION, version: stored.version, spec: stored.spec, templates: stored.templates, aliases: stored.aliases };
}

/** GET /api/workspaces/:id/document — export as an IAP document. */
export async function getDocument(_request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  return Response.json(toDocument(await loadOrThrow(env, id)));
}

/**
 * POST /api/workspaces/:id/changes — apply an IAP change (RFC 0003 §11.3): reject stale base
 * versions with the current document (409), apply the ops, validate the result in full (§12),
 * then store spec and template library together.
 */
export async function postChange(request: Request, env: Env, { id = "" }: Params): Promise<Response> {
  const change = await readJson(request, ChangeSchema);
  const stored = await loadOrThrow(env, id);
  const current = toDocument(stored);
  if (change.baseVersion !== current.version) {
    return Response.json({ error: "This workspace changed elsewhere", version: current.version, document: current }, { status: 409 });
  }
  const applied = applyChange(current, change);
  if (applied.issues.length > 0) throw new HttpError(400, "Invalid change", applied.issues);
  const checked = await checkWorkspace(applied.document.spec, applied.document.templates, styles);
  if (!("spec" in checked)) throw new HttpError(400, "Invalid change", checked.issues);
  for (const template of applied.library.putTemplates) {
    const parsed = parseTemplate(template);
    if ("issues" in parsed) throw new HttpError(400, `Invalid template "${template.id}"`, parsed.issues);
  }
  const result = await store(env, id).commit({
    spec: JSON.stringify(checked.spec),
    baseVersion: change.baseVersion,
    summary: change.summary,
    css: checked.css,
    putTemplates: applied.library.putTemplates.map((template) => ({ id: template.id, json: JSON.stringify(template) })),
    removeTemplates: applied.library.removeTemplates,
    aliases: applied.library.aliases,
  });
  if (!result.ok) return Response.json({ error: "This workspace changed elsewhere", version: result.version }, { status: 409 });
  await directory(env).touch(id, workspaceTitle(checked.spec));
  return Response.json({ version: result.version, css: checked.css });
}
