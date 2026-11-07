import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

export type WorkspaceSummary = { id: string; title: string; createdAt: string; updatedAt: string };

/** Lists workspaces (one instance for now; per user once identity lands). */
export class WorkspaceDirectory extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  }

  list(): WorkspaceSummary[] {
    return this.sql
      .exec<{ id: string; title: string; created_at: string; updated_at: string }>("SELECT * FROM workspaces ORDER BY updated_at DESC")
      .toArray()
      .map((row) => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  touch(id: string, title: string): void {
    const now = new Date().toISOString();
    this.sql.exec(
      "INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at",
      id,
      title,
      now,
      now,
    );
  }

  remove(id: string): void {
    this.sql.exec("DELETE FROM workspaces WHERE id = ?", id);
  }
}
