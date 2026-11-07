# ADR 0015: Connections have an access level; read-only credentials make every tool a read

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [ADR 0014](0014-data-connections-mcp-with-a-gatekeeper.md) (gatekeeper) |

## Context

Cloudflare's MCP server (`mcp.cloudflare.com/mcp`) exposes general tools instead of one per
endpoint: `search` (find API endpoints) and `execute` (run code against the Cloudflare API).
`execute` is annotated as a write, because it can change things, so the gatekeeper wouldn't let it
feed page data, and "List my Cloudflare Workers" was declined. Its permissions come from the OAuth
scopes granted at sign-in (or an API token's permissions), and we were requesting every scope the
server listed.

## Decision

- **Each connection has an access level, chosen when connecting:** Read only (default) or
  Read & write.
- **Read only:** OAuth requests only read scopes (`…:read`, `read…`, plus `offline_access`/OpenID);
  with a token, the user is asked to use a read-only one. Every tool on the connection is then a
  read (on, usable as page data, never destructive): the credential itself can't change anything.
- **Read & write:** all listed scopes; tools are read or write as the server describes them
  (writes off until enabled, only from clicks, destructive ones confirmed).
- **Effective access follows the grant:** if Read & write was chosen but the service granted only
  read scopes (e.g. Cloudflare's consent screen), the connection counts as read-only and the UI
  says so. Read-like scopes: `read`, `…:read`, `….read`, `metadata_read`, `content_read`,
  `monitoring`, `report`, plus `offline_access`/OpenID.
- **The model is told which tools are off** (and how to turn them on: switch it on in
  Connections, or reconnect Read only to use a write tool for page data), instead of only seeing
  the enabled ones and concluding a capability doesn't exist.
- **Per-tool override:** on a read & write connection the user can mark a write tool read-only
  after a warning (they vouch for the credential).
- The model is told how to use general tools: find the endpoint with `search`, try it with
  `inspect_tool`, then a source that calls `execute` with read-only code.
- Existing connections (made before access levels) count as read & write; reconnect to change.

## Consequences

- Read-only scope selection is a naming heuristic; servers with unusual scope names may need
  Read & write plus per-tool overrides, or a read-only token.
- Changing a connection's access level means signing in again (new scopes).
