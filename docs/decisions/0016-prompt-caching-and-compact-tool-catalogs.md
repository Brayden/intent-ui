# ADR 0016: Cache prompts, and list large tool catalogs compactly

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-10 |
| **Relates to** | [ADR 0002](0002-generation-in-worker-first.md) (generation in the Worker), [ADR 0014](0014-data-connections-mcp-with-a-gatekeeper.md) (connections) |

## Context

Every generation (compose, pointed edit, intent, page, research refresh) is a tool loop of up to
a dozen model turns: inspect tools, answer, repair validation issues. Each turn resent the whole
system prompt (guides, catalog and tool list, about 7k tokens before any connection) plus the
growing conversation, with no caching. Once real MCP servers are connected, the tool list
dominates: every tool's full input schema was inlined, tens of thousands of characters for
GitHub and Cloudflare alone, though a request uses a handful of tools.

## Decision

1. **Prompt caching on every request** (`worker/llm/anthropic.ts`). Three cache breakpoints:
   the system prompt (which also covers the tool definitions before it), the message before the
   newest model turn (exactly where the previous request's cache ended, so it's found even after
   a turn with many web-search blocks), and the newest message. Breakpoints are added to copies;
   the loop's history is never changed, so it never exceeds the API's four.
2. **System prompts hold only stable content.** Per-request content goes in the user message.
   Intent materialization moved its reusable-template candidates there for this reason.
3. **Compact tool catalogs** (`worker/llm/toolCatalog.ts`). When the listed tools' schemas exceed
   6,000 characters, the prompt lists each tool as one line (name, read/write, first sentence of
   its description) and the loop offers `describe_tools`, which returns full descriptions and
   schemas for up to 10 tools per call (4 calls per loop). Smaller catalogs are inlined as before,
   so setups without big MCP servers behave exactly as they did.
4. **Usage is logged** per request: input split into cache reads, writes and fresh tokens, plus
   output, so the hit rate is visible in `wrangler dev` / Workers logs.

## Consequences

- Repeated input in a loop costs about a tenth of fresh input after the first turn, and the
  shared system prompt is also reused across requests within the cache lifetime.
- With a 60-tool catalog, the compose system prompt shrinks by roughly 12k tokens.
- A model that needs a schema spends one extra turn on `describe_tools`. It's cheap (the turn is
  mostly cache reads) and it doesn't count as a repair attempt.
- Anything that varies per request must stay out of system prompts, or every request misses the
  cache. Reviewers should check this when prompts change.
