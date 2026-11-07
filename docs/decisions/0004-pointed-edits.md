# ADR 0004: Pointed edits are scoped ops on one tree, with an honest decline

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [RFC 0001](../rfcs/0001-continuous-generative-ui.md) §4.3 (right-click / pointed prompt), §8.1 (ops), §8.2 |

## Decision

- **Everything is a target; users control every aspect.** Right-click opens "Change this…"
  (Shift+right-click keeps the browser menu); the innermost thing wins. Targets are:
  - **components** in page blocks and overlays (table headers/cells target their `DataColumn`);
  - **block chrome**: the card, title, data-source badges, "Updated" time;
  - **layout**: any HTML element or slot, and empty page space (targets the layout root).

  Requests are `kind: "block" | "overlay" | "page"` with a plain-language target description;
  page-kind edits have no block tree and may only send page changes.
- **Chrome is spec, not code.** `frame` is `{ style: card|plain, title, sources, freshness }`, and
  page changes include `blockPatches` (frame/title for any block) and `removeBlocks`, so "don't
  show the pills for our data sources" patches every block it plausibly covers.
- **The model answers with ops, not a new tree.** `POST /api/intents/amend` offers two tools:
  `apply_changes { summary, ops }` and `decline { reason }`. Ops are `upsert` (add/replace a node)
  and `remove` (node + subtree, also dropped from its parent). `applyBlockOps` in `shared/spec` is
  pure, so client and server produce the same tree from the same ops.
- **The target says *what*, not *where*.** The model places new UI where a good designer would:
  inside the target, in the block's **toolbar** (header, next to the data-source badges), in a new
  wrapper, or by **reshaping the page** around the block. It may change any node of the target's
  block (e.g. hiding sibling columns), and for page blocks it may also send `page` changes:
  layout ops, block placements, and new blocks (which read the same data as the target block).
  Every result is validated: block trees against the catalog, layouts against the style allowlist
  and structure, and every block must end up in an existing slot. (The first version limited edits
  to the target's subtree and ancestors; that blocked legitimate requests like a column picker.)
- **Edits can change where a block's data comes from** (not just how it looks). For page blocks the
  request carries the client's spec, and `apply_changes` may include `sources` (add/replace, incl. web
  research and connected tools, with `inspect_tool` and web search available) and `data` (the block's
  new `inputs`, `view`, `fields`). These are validated like compose (read-only tools, citations) and
  dry-run: the server fetches the data and evaluates the block's view before accepting, and returns the
  resulting views so the change shows data immediately. Sources other blocks use are kept; new ones get
  new ids.
- **Building blocks for creative edits.** `Stack` (layout container), `Popover`, `Checkbox` bound
  to UI state, per-block UI state under `/ui/...` (written by `set`), and a `visible` condition on
  any node. Ops include `setRoot` (e.g. wrap the body in a Stack) and `setToolbar`.
- **Data limits are explicit.** The model sees a small sample of the block's view model and the
  current item. If a change needs data that isn't there (e.g. "merged today" without PR history),
  it must `decline` and say what's missing, rather than fake values.
- **Bindings validate as "any type".** Authored props may hold `{ path }` where the schema expects
  a concrete type (e.g. `rows`); the validator accepts those and the renderer re-validates resolved
  values.
- **One prompt, everywhere.** The prompt is a floating box at the click point, portaled to `<body>`
  above everything, open modals included ([ADR 0010](0010-command-menu-is-the-only-chrome.md);
  this replaced an earlier inline-in-overlay prompt).

## Consequences

- Edits are small, reviewable, and replayable (the same ops format will feed the op log).
- Edits live in memory until the workspace agent persists the spec.
- Changes that need new data become possible once sources/JSONata land: the model will then be
  able to add a source + view field alongside the UI ops.
