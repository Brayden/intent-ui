# ADR 0014: Data connections are remote MCP servers behind a thin gatekeeper

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [RFC 0001](../rfcs/0001-continuous-generative-ui.md) (data sources), [ADR 0002](0002-generation-in-worker-first.md) |

## Context

Workspaces only had mock connections (HR, GitHub, Linear) and the web. Users need to connect their
own services (GitHub, Linear, Cloudflare, …) once and use them everywhere, without handing
credentials to the model or the browser, and with control over what the AI can read and do.
Cloudflare OS's Gatekeepers (service-specific Workers that hold credentials and enforce
per-resource policy, observation tracking, approvals) are the full version of this; most of that
matters once workspaces are shared between people.

## Decision

**One protocol: remote MCP over Streamable HTTP.** Every connection is an MCP server URL, with
presets for GitHub, Linear and Cloudflare (`https://mcp.cloudflare.com/mcp`) and any custom
URL. The client is ours and dependency-free (`worker/mcp/client.ts`): JSON-RPC by POST, JSON or SSE
responses, session ids, paginated `tools/list`, `tools/call` (structured content, else JSON text,
else `{ text }`).

**Sign-in: OAuth via MCP authorization, or a token.** (`worker/mcp/oauth.ts`)
- OAuth 2.1: protected-resource metadata (from the 401 `WWW-Authenticate` hint or `.well-known`),
  authorization-server metadata, dynamic client registration (RFC 7591), PKCE (S256), `resource`
  (RFC 8707), code exchange at `/api/connections/oauth/callback`, refresh (rotation supported) on
  expiry or 401. Linear and Cloudflare's servers work this way.
- Your own OAuth app (client ID + secret) for servers without dynamic registration: GitHub.
- An access token sent as `Authorization: Bearer …` (GitHub PAT, Linear API key, Cloudflare token).

**Storage.** A `ConnectionsStore` Durable Object per user ("local" until identity lands) holds
configs, credentials, pending sign-ins (single use, 15-minute expiry), cached tools, tool policy,
and the activity log. The browser only ever sees summaries without credentials.

**A thin gatekeeper** (`connections/policy.ts`, `registry.ts`), where every call already passes:
- Read vs write per tool from MCP annotations (`readOnlyHint`, `destructiveHint`), else guessed
  from the name; the user can correct it.
- Read tools are on by default; writes are off until the user turns them on. The model only ever
  sees enabled tools; calling a disabled one fails with a clear message.
- Writes still only run from a user's click (`/api/tools/call`); destructive ones answer 409 until
  the user confirms in a Kumo alert dialog.
- Every call is logged (tool, read/write, ok, latency, error) and shown per connection.
- Each request loads the user's connected servers into AsyncLocalStorage, so `listTools`/`findTool`
  everywhere see live connections. Connections that need sign-in drop out until re-authorized.

**Demo data: HR only.** A mock "Acme HR" connection keeps the example workspace working without
accounts. (Demo GitHub and Linear were removed: connect the real ones.)

**UI.** The home page has a Connections section: add (preset or custom URL; OAuth or token), manage
(tool switches grouped Read/Write, "mark as read/write" for unannotated tools, activity, sign in
again, refresh tools, disconnect).

## Not yet (where they plug in later)

- Per-resource scoping (one repo, masked fields), rate limits, and observation tracking for shared
  workspaces: the same gatekeeper wrapper, with resource-aware policy per connection.
- Per-user identity (Cloudflare Access); credentials are stored as-is in the user's Durable Object.
- Legacy SSE-only servers; large tool lists (GitHub has many) may need per-workspace tool selection.

## Consequences

- Workspaces built on the removed demo GitHub/Linear show source errors; asking for a change
  rewires them to the real connections.
- No new packages: OAuth and MCP are implemented on `fetch` + Web Crypto.
