/*
 * A minimal MCP client over Streamable HTTP (MCP spec 2025-06-18): JSON-RPC requests by POST,
 * answered as JSON or as an SSE stream, with the server's session id carried along. Enough for
 * initialize, tools/list and tools/call. No dependencies, so it runs anywhere `fetch` does.
 */

export const PROTOCOL_VERSION = "2025-06-18";

/** A tool as an MCP server describes it. */
export type McpTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
};

/** The server rejected our credentials (401): sign in again, or refresh the token. */
export class McpAuthError extends Error {
  constructor(
    message: string,
    /** From `WWW-Authenticate: Bearer resource_metadata="…"`, when the server sends it. */
    readonly resourceMetadata?: string,
  ) {
    super(message);
  }
}

export class McpError extends Error {}

type JsonRpcResponse = { jsonrpc: "2.0"; id: number | string; result?: unknown; error?: { code: number; message: string; data?: unknown } };

/** Parses `resource_metadata="…"` out of a WWW-Authenticate header. */
export function resourceMetadataUrl(header: string | null): string | undefined {
  return header?.match(/resource_metadata="([^"]+)"/)?.[1];
}

/** Reads an SSE body until the JSON-RPC response with `id` arrives. */
async function readSse(response: Response, id: number): Promise<JsonRpcResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new McpError("Empty event stream");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      // Events are separated by a blank line; each has one or more `data:` lines.
      let boundary: number;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        const message = JSON.parse(data) as JsonRpcResponse;
        if (message.id === id) return message;
      }
      if (done) throw new McpError("Event stream ended before the response");
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

export type McpClientOptions = {
  url: string;
  /** Extra headers, e.g. a bearer token for token-based connections. */
  headers?: () => Promise<Record<string, string>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/** One MCP session. Initializes lazily on the first request. */
export class McpClient {
  private sessionId: string | undefined;
  private initialized: Promise<void> | undefined;
  private nextId = 1;

  constructor(private readonly options: McpClientOptions) {}

  private async post(body: unknown, expectResponse: boolean, id?: number): Promise<JsonRpcResponse | undefined> {
    const doFetch = this.options.fetch ?? fetch;
    const response = await doFetch(this.options.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL_VERSION,
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        ...((await this.options.headers?.()) ?? {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
    });
    if (response.status === 401 || response.status === 403) {
      const text = await response.text().catch(() => "");
      throw new McpAuthError(text.slice(0, 200) || `HTTP ${response.status}`, resourceMetadataUrl(response.headers.get("www-authenticate")));
    }
    if (!response.ok && response.status !== 202) {
      throw new McpError(`MCP server error ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`);
    }
    const session = response.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    if (!expectResponse || id === undefined) return undefined;
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/event-stream")) return readSse(response, id);
    return (await response.json()) as JsonRpcResponse;
  }

  private async rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const message = await this.post({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }, true, id);
    if (!message) throw new McpError(`No response to ${method}`);
    if (message.error) throw new McpError(`${method} failed: ${message.error.message}`);
    return message.result as T;
  }

  private ensureInitialized(): Promise<void> {
    this.initialized ??= (async () => {
      await this.rpc("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "intent-ui", version: "0.1.0" },
      });
      await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, false);
    })().catch((error: unknown) => {
      this.initialized = undefined; // let a later call retry (e.g. after re-authenticating)
      throw error;
    });
    return this.initialized;
  }

  /** All tools, following pagination. */
  async listTools(): Promise<McpTool[]> {
    await this.ensureInitialized();
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.rpc<{ tools: McpTool[]; nextCursor?: string }>("tools/list", cursor ? { cursor } : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor && tools.length < 1000);
    return tools;
  }

  /**
   * Calls a tool. Returns its structured content when it has some, else its text parsed as
   * JSON when it is JSON, else `{ text }`. Tool-level errors (`isError`) throw.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureInitialized();
    const result = await this.rpc<{ content?: Array<{ type: string; text?: string }>; structuredContent?: unknown; isError?: boolean }>(
      "tools/call",
      { name, arguments: args },
    );
    const text = (result.content ?? []).filter((part) => part.type === "text" && part.text).map((part) => part.text).join("\n");
    if (result.isError) throw new McpError(text || `${name} failed`);
    if (result.structuredContent !== undefined) return result.structuredContent;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { text };
    }
  }
}
