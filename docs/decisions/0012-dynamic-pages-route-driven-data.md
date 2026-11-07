# ADR 0012: Dynamic pages: route-driven data loaders

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [ADR 0011](0011-generated-pages-and-routes.md) (pages and routes), [ADR 0009](0009-web-knowledge-as-replayable-sources.md) (research sources), [ADR 0004](0004-pointed-edits.md) (layout edits) |

## Context

ADR 0011 gave pages route params read as `$route`, but in practice a generated "artist" page
showed the clicked artist for every artist: with no music connection, the model used web research,
which is a fixed snapshot. Asking to make the page dynamic was then declined: right-clicking the
layout could only move blocks, not change data or params, and nothing could add params to an
existing page.

## Decision

**Every loader can take the route.** Tool and `web/fetch` sources read `$route` in args and
normalize; views read it in their expression; and research sources can now be **parameterized**:
`params: ["artist"]` with `{artist}` placeholders in `query`/`instructions`, `data` researched for
an example (`dataFor`). When a page loads with other values, the recipe is replayed for them (the
same fields and key; no promotion to a fixed recipe) and cached in the workspace's Durable Object
by recipe + values; concurrent loads share one run. Dry runs use the example snapshot.

**Pages can become dynamic after the fact.** Compose gains `pageParams` (replace the page's params,
each with `from` (the opener item's field) and an `example` for the dry run) and `blockData`
(rewire existing blocks' inputs/view). The model sees which blocks open the page (`pageOpeners`),
so it can pick `from`. After applying, the client opens the page with the example values if the URL
has none, otherwise reloads for the current values.

**Validation.** A page with params whose blocks' data doesn't depend on the route is rejected ("every
value would show the same thing"). Parameterized research must use each param in its query, give
`dataFor`, and use only the page's params.

**Right-clicking the page layout goes to compose**, which can do everything the old page-only edit
could plus data and params, so "make this page dynamic" works wherever you click.

**Links fill params from the item.** A `navigate` to a page with params fills any it doesn't give
from the clicked item via each param's `from`, as page intents already did. Refreshes save pending
edits first, since the server computes data from the saved spec.

## Consequences

- First visit to a new value of a research-backed page takes a model call with web search (seconds
  to tens of seconds); blocks show their loading state meanwhile. Later visits are instant.
- Cached research per value doesn't refresh yet; a research refresh on such a page refreshes the
  example. Per-value refresh (and cache expiry) can be added on the same cache key.
- Prefer verified public JSON APIs via `web/fetch` with `$route` when they exist: deterministic and fast.
