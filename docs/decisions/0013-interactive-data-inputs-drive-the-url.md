# ADR 0013: Interactive data: inputs drive the URL, the URL drives loaders

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [ADR 0011](0011-generated-pages-and-routes.md), [ADR 0012](0012-dynamic-pages-route-driven-data.md) (route-driven data) |

## Context

A generated search box couldn't search: data loads on the server from sources, and the only
inputs sources could read were the URL's route params. Text typed into the UI (`/ui` state) never
reached a loader, and there was no text input component at all, so the model declined.

## Decision

**User input that changes what data loads goes in the URL.** Rather than letting sources read
`/ui` state (per-block, client-side), inputs write the page's route params, which loaders already
read as `$route`. One mechanism for links, deep pages, and search; the URL is shareable, and
back/forward replay searches.

- **`TextInput` component** (Kumo `Input`), bound two-way to `/ui/...` (saved as you type) or
  `/route/<param>` (written on Enter, or as you type with `live`; a burst of typing adds one
  history entry). Enter fires its `action`.
- **`set` on `/route/<param>`** updates the current page's URL without scrolling (empty clears it),
  e.g. a Search button: `set /route/q ← /ui/query`. Blocks read the current values at `/route/...`.
- **Optional params** (`optional: true`): the page renders without them (a search page with no
  query yet). Required params still gate the page.
- **`when` on tool sources**: a JSONata condition over inputs and `$route`; the tool is called only
  when it's truthy (e.g. `"$route.q"`), otherwise the source is empty.
- **Partial reloads**: when only the route changes on the same page, only blocks whose data reads
  the route are recomputed (`blocks` on the refresh request); the rest keep their data.
- **Validation**: writing `/route/x` needs the page to declare `x`. Right-click edits can now set
  `pageParams` too, so a block-level "make this search work" can add the param itself.

## Consequences

- Filters that only change what's shown can stay in `/ui` with `visible`; anything an API or a
  computed view must apply goes through the route (and is recomputed on the server).
- Each submitted search is a server round trip; live search waits for a short pause in typing.
