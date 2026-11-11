import { AsyncLocalStorage } from "node:async_hooks";
import { PRESETS, type ConnectionSummary, type ToolInfo } from "../../shared/api";
import type { Env } from "../env";
import { HttpError } from "../lib/http";
import { acmeHr } from "./mock/acmeHr";
import { governTool } from "./policy";
import { callConnectionTool, effectiveAccess, listStored, logActivity, type StoredConnection } from "./service";
import type { Connection } from "./types";
import { web } from "./web/web";

/*
 * The connections available to one request (ADR 0014): built-ins (web, demo data) plus the
 * user's connected MCP servers, each behind the gatekeeper. Loaded once per request and kept in
 * AsyncLocalStorage, so `listTools`/`findTool` work anywhere without threading it through.
 */

type Registry = { connections: Connection[] };

/** Demo data, so the example workspace works without accounts. */
const DEMO: Connection[] = [acmeHr];
const BUILTINS: Connection[] = [web, ...DEMO];

/** Built-ins for this request: the web, demo data (standalone app only), and the host's own tools. */
const builtins = (env: Env): Connection[] => [web, ...(env.demoData ? DEMO : []), ...env.hostTools];

const requestRegistry = new AsyncLocalStorage<Registry>();
const current = (): Registry => requestRegistry.getStore() ?? { connections: BUILTINS };

/** Wraps a connected MCP server: only enabled tools are visible or callable, and every call is logged. */
function governed(env: Env, stored: StoredConnection): Connection {
  const all = stored.tools.map((tool) => governTool(stored.id, tool, stored.policy[tool.name], effectiveAccess(stored)));
  const enabled = all.filter((tool) => tool.enabled);
  return {
    id: stored.id,
    name: stored.name,
    tools: enabled.map(({ enabled: _enabled, annotated: _annotated, title: _title, readOnlyBy: _readOnlyBy, ...tool }) => tool),
    disabled: all.filter((tool) => !tool.enabled).map((tool) => tool.name),
    async call(tool, args) {
      const info = all.find((candidate) => candidate.name === tool);
      const started = Date.now();
      const entry = { at: new Date().toISOString(), connection: stored.id, tool, kind: info?.readOnly ? ("read" as const) : ("write" as const) };
      try {
        const result = await callConnectionTool(env, stored, tool, args);
        await logActivity(env, { ...entry, ok: true, ms: Date.now() - started });
        return result;
      } catch (error) {
        await logActivity(env, { ...entry, ok: false, ms: Date.now() - started, error: (error as Error).message.slice(0, 300) });
        throw error;
      }
    },
  };
}

/** Loads this user's connections for a request. */
export async function loadRegistry(env: Env): Promise<Registry> {
  const stored = await listStored(env);
  const real = stored.filter((connection) => connection.status === "connected").map((connection) => governed(env, connection));
  const realIds = new Set(real.map((connection) => connection.id));
  return { connections: [...builtins(env).filter((connection) => !realIds.has(connection.id)), ...real] };
}

/** Runs `work` with `registry` as the request's connections. */
export function withRegistry<T>(registry: Registry, work: () => T): T {
  return requestRegistry.run(registry, work);
}

/**
 * Tools the model can't use, with why: so it can tell the user how to enable them instead of
 * saying they don't exist.
 */
export function listUnavailableTools(): Array<{ connection: string; connectionName: string; name: string }> {
  return current().connections.flatMap((connection) => (connection.disabled ?? []).map((name) => ({ connection: connection.id, connectionName: connection.name, name })));
}

/** Tools the model may use (enabled ones only). */
export function listTools(): ToolInfo[] {
  return current().connections.flatMap((connection) => connection.tools);
}

export function findTool(connectionId: string, toolName: string): { connection: Connection; tool: ToolInfo } {
  const connection = current().connections.find((candidate) => candidate.id === connectionId);
  if (!connection) throw new HttpError(404, `Unknown connection "${connectionId}"`);
  const tool = connection.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    if (connection.disabled?.includes(toolName)) {
      throw new HttpError(403, `"${toolName}" is turned off for ${connection.name}. Turn it on in Connections on the home page.`);
    }
    throw new HttpError(404, `Connection "${connectionId}" has no tool "${toolName}"`);
  }
  return { connection, tool };
}

/** Built-in connections as the connections page shows them; demo ones note what replaced them. */
export function builtinSummaries(env: Env, stored: StoredConnection[]): ConnectionSummary[] {
  const connected = new Set(stored.filter((connection) => connection.status === "connected").map((connection) => connection.id));
  return builtins(env).map((connection) => ({
    id: connection.id,
    name: connection.name,
    url: "",
    auth: "none" as const,
    access: "read" as const,
    status: "connected" as const,
    builtin: true,
    demo: DEMO.includes(connection),
    preset: PRESETS.some((preset) => preset.id === connection.id) ? connection.id : undefined,
    replacedBy: connected.has(connection.id) ? connection.id : undefined,
    tools: connection.tools.map((tool) => ({ ...tool, enabled: true, annotated: true })),
  }));
}
