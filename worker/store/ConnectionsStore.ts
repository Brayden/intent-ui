import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../env";

const PENDING_TTL_MS = 15 * 60 * 1000;
const MAX_ACTIVITY = 2000;

/**
 * A user's data connections (ADR 0014): each connection's config, credentials, cached tools and
 * tool policy (as one JSON document), in-flight OAuth sign-ins, and the gatekeeper's activity
 * log. Credentials stay here and in the Worker; they never reach the browser or the model.
 * Logic lives in `connections/service.ts`; this is storage. Values cross RPC as JSON strings.
 */
export class ConnectionsStore extends DurableObject<Bindings> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pending (state TEXT PRIMARY KEY, json TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS activity (seq INTEGER PRIMARY KEY AUTOINCREMENT, connection TEXT NOT NULL, json TEXT NOT NULL);
    `);
  }

  list(): string[] {
    return this.sql.exec<{ json: string }>("SELECT json FROM connections ORDER BY id").toArray().map((row) => row.json);
  }

  get(id: string): string | null {
    return this.sql.exec<{ json: string }>("SELECT json FROM connections WHERE id = ?", id).toArray()[0]?.json ?? null;
  }

  put(id: string, json: string): void {
    this.sql.exec("INSERT INTO connections (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json", id, json);
  }

  remove(id: string): void {
    this.sql.exec("DELETE FROM connections WHERE id = ?", id);
    this.sql.exec("DELETE FROM activity WHERE connection = ?", id);
  }

  /** Remembers an OAuth sign-in in progress, keyed by its `state`. */
  putPending(state: string, json: string): void {
    this.sql.exec("DELETE FROM pending WHERE created_at < ?", Date.now() - PENDING_TTL_MS);
    this.sql.exec("INSERT INTO pending (state, json, created_at) VALUES (?, ?, ?)", state, json, Date.now());
  }

  /** Returns and forgets a sign-in by `state` (each can be completed once), if it hasn't expired. */
  takePending(state: string): string | null {
    const row = this.sql.exec<{ json: string; created_at: number }>("SELECT json, created_at FROM pending WHERE state = ?", state).toArray()[0];
    this.sql.exec("DELETE FROM pending WHERE state = ?", state);
    return row && row.created_at >= Date.now() - PENDING_TTL_MS ? row.json : null;
  }

  logActivity(connection: string, json: string): void {
    this.sql.exec("INSERT INTO activity (connection, json) VALUES (?, ?)", connection, json);
    this.sql.exec("DELETE FROM activity WHERE seq <= (SELECT MAX(seq) FROM activity) - ?", MAX_ACTIVITY);
  }

  activity(connection: string, limit: number): string[] {
    return this.sql
      .exec<{ json: string }>("SELECT json FROM activity WHERE connection = ? ORDER BY seq DESC LIMIT ?", connection, limit)
      .toArray()
      .map((row) => row.json);
  }
}
