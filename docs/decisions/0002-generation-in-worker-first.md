# ADR 0002: Generate in a stateless Worker route first; Durable Objects later

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [RFC 0001](../rfcs/0001-continuous-generative-ui.md) §6 (architecture), §11 (delivery plan) |

## Context

RFC 0001 puts generation, connections, and the canvas in a `WorkspaceAgent` Durable Object.
To start generating UI now (deferred intents → overlays), we need a model call, validation,
and a tool path, but not yet persistence, multiple clients, or an op stream.

## Decision

- Generation runs in **plain Worker routes** (`worker/routes/`), which `npm run dev` already
  serves locally through the Cloudflare Vite plugin. No separate local server.
- The model is called with **`fetch` to the Anthropic Messages API** (`worker/llm/anthropic.ts`),
  no SDK. Model defaults to `claude-opus-5-5`, overridable with `ANTHROPIC_MODEL`. The key lives
  in `.dev.vars` locally and `wrangler secret put ANTHROPIC_API_KEY` in production.
- Structured output uses a **tool call** (`emit_template`) whose input schema is generated from
  `shared/spec`. Tool choice is `auto` (Opus 5.5 rejects forced `tool`/`any` choice); the prompt
  requires the call, and a response without one is treated as a repairable failure. Results are validated against `shared/catalog`; issues are sent back as a
  `tool_result` error for repair, up to 3 attempts. Invalid UI never reaches the client.
- The **component catalog is shared** (`shared/catalog`): one set of zod specs drives the
  model's catalog prompt, server validation, and client rendering.
- **Templates are cached in the client** (memory) keyed by block + intent, until the agent
  persists them.
- Connections implement a small `Connection` interface (`worker/connections/types.ts`) so mock
  connections today and MCP connections later are interchangeable.

## Consequences

- Moving to the Durable Object later means moving the route bodies into agent methods; the
  generation, validation, and catalog code is unaffected.
- Until then: no persistence (templates and mock data reset on reload/restart), single client.
- **Known gap:** RFC 0001 §10 requires confirmation before write tools. For now the generated
  form itself (explicit fields + Save) is the confirmation; a generic confirmation for writes
  triggered any other way is still to do.
