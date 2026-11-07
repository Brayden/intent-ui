# ADR 0009: Knowledge from the web becomes cited, replayable data sources

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [ADR 0001](0001-spec-is-source-of-truth.md) §9 (non-deterministic extraction), [ADR 0008](0008-persistence-data-layer-and-compose.md) (compose) |

## Context

Requests like "top 100 songs" need general internet knowledge, not a connected tool. Web pages are
prose, not structured data, and data from the web changes, so whatever we save must be refreshable
in a predictable way, with honest provenance.

## Decision

**Search while building.** Compose (the ⌘K command menu) and right-click edits on page blocks can use Anthropic's server-side web search
(`web_search_20250305`, ≤ 5 searches per request). Its result blocks are passed back unchanged; the
tool loop continues after `pause_turn`. Search results are never used directly: what the model finds
is saved as a data source, in one of two tiers.

**Tier 1, deterministic: a `web/fetch` source.** A new read-only `web` connection with a `fetch`
tool: JSON URLs return `{ json }`; HTML with an extraction recipe (`items` CSS selector + `fields`
selectors/attributes, run with the Workers `HTMLRewriter`) returns `{ items }`; HTML without a recipe
returns `{ title, text }` for the model to read. Sources using it refresh with the page like any
source, without the model. Fetching is https-only, refuses private/internal hosts (also after
redirects), and has size and time limits. Compose dry-runs these recipes and rejects ones that return
no rows.

**Tier 2, replayable: a `research` source.** When no stable structured page exists, the model saves
`{ kind: "research", query, instructions, preferSources, key, schema, data, provenance }`: the rows it
extracted plus the recipe to do it again. It's served from `data` on load. Refreshing it (the "web"
pill → **Refresh from the web**) replays the query and instructions with the same output contract
(same fields and key), compares the result by key (added / removed / changed), and asks the user to
confirm big drops before applying.

**Promotion.** Each tier 2 refresh also asks the model for a tier 1 recipe that reproduces the rows.
The server runs it and, if ≥ 80% of keys and ≥ 80% of shared fields match, replaces the research
source with the `web/fetch` source **under the same id**, so blocks are unaffected and future
refreshes are model-free.

**Provenance and trust.**
- Every web source carries `provenance { researchedAt, query, citations }`. Citations must be pages the
  model actually saw in that request (search results or fetched URLs); others are rejected.
- Blocks show a clickable **web** pill with citations, research date or "fetched each refresh", and the
  refresh button. "Updated" for tier 2 is the research date.
- Fetched page content is labelled to the model as untrusted data, never instructions. Only facts and
  lists are kept, not copied passages, lyrics, or articles. Connected tools are preferred when they have
  the data.

## Consequences

- "Top 100 songs"-style requests work, with sources users can check and refresh.
- Tier 2 refreshes cost a model run and searches; they run only on request.
- HTML extraction runs only in the Workers runtime (`HTMLRewriter`) and isn't covered by the
  sandbox tests; JSON-API recipes, guards, citations, diffs, and promotion are.
- Not yet: scheduled refreshes, a per-workspace allow/deny list of
  domains, or proxying images from the web.
