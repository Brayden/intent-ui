import { DurableObject } from "cloudflare:workers";
import type { Template } from "../../shared/api";
import type { BlockView, Workspace } from "../../shared/spec";
import type { Bindings } from "../env";

const MAX_VERSIONS = 200;

export type StoredWorkspace = {
  spec: Workspace;
  version: number;
  /** Compiled CSS for every class in the spec and its templates (ADR 0006). */
  css: string;
  /** Last computed view per block, for instant reloads (ADR 0001 §6). */
  views: Record<string, BlockView>;
  templates: Template[];
  aliases: Record<string, string>;
};

export type SaveResult = { ok: true; version: number } | { ok: false; version: number };

/**
 * One workspace (ADR 0008): its spec with a version history, template library, compiled CSS,
 * and view snapshots, in the Durable Object's SQLite storage. Validation happens in the Worker
 * before anything reaches here. Specs cross the RPC boundary as JSON strings.
 */
export class WorkspaceStore extends DurableObject<Bindings> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS versions (version INTEGER PRIMARY KEY, at TEXT NOT NULL, summary TEXT NOT NULL, spec TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS aliases (key TEXT PRIMARY KEY, template_id TEXT NOT NULL);
    `);
  }

  private get(key: string): string | undefined {
    return this.sql.exec<{ value: string }>("SELECT value FROM kv WHERE key = ?", key).toArray()[0]?.value;
  }

  private put(key: string, value: string): void {
    this.sql.exec("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  }

  private record(version: number, summary: string, spec: string): void {
    this.sql.exec("INSERT INTO versions (version, at, summary, spec) VALUES (?, ?, ?, ?)", version, new Date().toISOString(), summary, spec);
    this.sql.exec("DELETE FROM versions WHERE version <= ?", version - MAX_VERSIONS);
  }

  /** Creates the workspace. No-op if it already exists. */
  init(json: string, css: string): void {
    if (this.get("spec")) return;
    this.put("spec", json);
    this.put("version", "1");
    this.put("css", css);
    this.record(1, "Created", json);
  }

  /** The whole workspace as JSON (`StoredWorkspace`), or null if it doesn't exist. */
  load(): string | null {
    const spec = this.get("spec");
    if (!spec) return null;
    const templates = this.sql.exec<{ json: string }>("SELECT json FROM templates").toArray().map((row) => JSON.parse(row.json) as Template);
    const aliases = Object.fromEntries(
      this.sql.exec<{ key: string; template_id: string }>("SELECT key, template_id FROM aliases").toArray().map((row) => [row.key, row.template_id]),
    );
    const stored: StoredWorkspace = {
      spec: JSON.parse(spec) as Workspace,
      version: Number(this.get("version") ?? 1),
      css: this.get("css") ?? "",
      views: JSON.parse(this.get("views") ?? "{}") as Record<string, BlockView>,
      templates,
      aliases,
    };
    return JSON.stringify(stored);
  }

  /** Saves a new spec if `baseVersion` is current (optimistic concurrency); records a version. */
  save(json: string, baseVersion: number, summary: string, css: string): SaveResult {
    const current = Number(this.get("version") ?? 0);
    if (baseVersion !== current) return { ok: false, version: current };
    const version = current + 1;
    this.put("spec", json);
    this.put("version", String(version));
    this.put("css", css);
    this.record(version, summary, json);
    return { ok: true, version };
  }

  saveViews(json: string): void {
    this.put("views", json);
  }

  /** Cached data by key (e.g. researched rows per route value, ADR 0012). */
  getCached(key: string): string | null {
    return this.get(`cache:${key}`) ?? null;
  }

  putCached(key: string, json: string): void {
    this.put(`cache:${key}`, json);
  }

  /** Stores a template (new or edited) and, optionally, which intent resolves to it. */
  putTemplate(id: string, json: string, aliasKey: string | undefined, css: string): void {
    this.sql.exec("INSERT INTO templates (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json", id, json);
    if (aliasKey) {
      this.sql.exec(
        "INSERT INTO aliases (key, template_id) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET template_id = excluded.template_id",
        aliasKey,
        id,
      );
    }
    this.put("css", css);
  }

  /**
   * Applies an IAP change (RFC 0003 §11.3) in one step: the new spec (if `baseVersion` is current),
   * plus template and alias writes. Durable Object calls run one at a time, so this is atomic.
   */
  commit(change: {
    spec: string;
    baseVersion: number;
    summary: string;
    css: string;
    putTemplates: Array<{ id: string; json: string }>;
    removeTemplates: string[];
    aliases: Record<string, string | null>;
  }): SaveResult {
    const saved = this.save(change.spec, change.baseVersion, change.summary, change.css);
    if (!saved.ok) return saved;
    for (const template of change.putTemplates) {
      this.sql.exec("INSERT INTO templates (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json", template.id, template.json);
    }
    for (const id of change.removeTemplates) {
      this.sql.exec("DELETE FROM templates WHERE id = ?", id);
      this.sql.exec("DELETE FROM aliases WHERE template_id = ?", id);
    }
    for (const [key, templateId] of Object.entries(change.aliases)) {
      if (templateId === null) this.sql.exec("DELETE FROM aliases WHERE key = ?", key);
      else {
        this.sql.exec(
          "INSERT INTO aliases (key, template_id) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET template_id = excluded.template_id",
          key,
          templateId,
        );
      }
    }
    return saved;
  }

  history(): Array<{ version: number; at: string; summary: string }> {
    return this.sql.exec<{ version: number; at: string; summary: string }>("SELECT version, at, summary FROM versions ORDER BY version DESC").toArray();
  }

  /** The spec JSON as it was at `version`, if still in history. */
  specAt(version: number): string | null {
    return this.sql.exec<{ spec: string }>("SELECT spec FROM versions WHERE version = ?", version).toArray()[0]?.spec ?? null;
  }

  /** Deletes all of this workspace's data. */
  async destroy(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
