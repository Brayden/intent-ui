# ADR 0011: Intents can open generated pages, with routes

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [RFC 0002](../rfcs/0002-spec-format-v0.md) (pages), [ADR 0003](0003-template-library-and-reuse.md) (intents), [ADR 0008](0008-persistence-data-layer-and-compose.md) (compose) |

## Context

Intents only produced modals over the current page. Users want to go deeper ("go to this artist's
profile"): a real page with its own URL, generated the first time someone asks for it, that works
for every artist, not just the one clicked. A workspace could already hold several pages, but only
the first was ever shown and nothing could navigate between them.

## Decision

**Routes.** `/w/:id` shows a workspace's first page; `/w/:id/:pageId?name=value…` shows any page.
Browser back/forward work. The ⌘K menu lists pages that need no params.

**Pages take params.** A page may declare `params` (e.g. `artist: { description, from: "artist" }`).
Their values come from the URL and are bound as `$route` in source args, normalize, and block view
expressions, so one page definition serves every value. Only declared params reach the data layer.
Pages with params don't save view snapshots (data differs per URL).

**Intents can open pages.** An `intent` action with `open: "page"` (default `"overlay"`) leads to
a page. First click: `POST /api/workspaces/:id/pages` generates it (the model declares params with
the clicked item's field for each, then builds the page like compose, dry-run with that item's
values). The client adds it to the spec (autosaved) and navigates. The page records the intent
(`page.intent`), so later clicks on any item go straight to it, filling params from that item.

**In-app navigation.** `navigate` takes `{ page, params? }` for pages in this app, or `{ url }`
for an external link in a new tab. Generated pages start with a "← back" button using it.

## Consequences

- Item-specific data on a generated page must come from sources that take `$route` (connection
  tools, or deterministic `web/fetch` recipes). Tier 2 `research` sources are fixed snapshots, so
  they can't vary per item yet; per-route research would need caching keyed by route values.
- A page id is a slug from the intent id. Renaming or removing pages isn't exposed yet beyond
  editing what's on them.
- Right-click edits and ⌘K changes on a page with params are dry-run with its current values.
