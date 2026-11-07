# ADR 0008: Saved workspaces, a real data layer, and building from a blank page

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [ADR 0001](0001-spec-is-source-of-truth.md) (persistence, snapshots), [ADR 0002](0002-generation-in-worker-first.md) (Durable Objects), [RFC 0002](../rfcs/0002-spec-format-v0.md) §5–7 (sources, views, reload) |

## Context

The demo ran from a hard-coded spec with simulated data, and every change was lost on reload.
Users need to come back to what they built, and to start from nothing by describing what they want.

## Decision

### Persistence: one Durable Object per workspace
- `WorkspaceStore` (SQLite-backed Durable Object, one per workspace) stores the spec, a version
  history (last 200 versions, each with a summary), the template library and intent aliases,
  compiled CSS for everything in the workspace, and the last view snapshots.
  `WorkspaceDirectory` (singleton for now; per user once identity lands) lists workspaces.
- **Autosave.** The client saves ~600 ms after each change, one save at a time. Saves use optimistic
  concurrency (`baseVersion`); a stale save gets `409` and the user is told to reload, never silently
  overwritten. Templates are saved as they're generated or edited.
- **The server validates every save** like generated output: schema, every layout and block tree,
  and the brand policy for every class (ADR 0006). It also recompiles the workspace's CSS, which
  is returned on load and injected before first render.
- Specs cross the Durable Object RPC boundary as JSON strings.

### Data layer: sources → JSONata → views, run in the Worker
- `worker/data` runs the sources a page needs in dependency order (parallel where possible, each
  once per run): tool call → `normalize` (JSONata) → result. Local sources return their data. Keyed
  sources are always arrays (JSONata unwraps one-item lists). Failures become error results, not
  exceptions.
- Block views evaluate `view.expr` with inputs bound by alias; failed inputs are bound as `null` so
  the rest still renders. JSONata runs with a 1 s budget.
- On open, the client shows the stored snapshots immediately, then refreshes (`POST …/data`); refresh
  buttons and `refresh` actions do the same. Snapshots are saved after each refresh.
- Mock GitHub and Linear connections join the mock HR directory, so the example workspace runs on
  real tool calls and JSONata, not fixture data.

### Building from a blank page: compose
- The home page lists workspaces and starts a **blank workspace** (one page, one slot) or the example.
- A **chat bar** is always at the bottom of a workspace (RFC 0001 §4.3; now the ⌘K command menu, [ADR 0010](0010-command-menu-is-the-only-chrome.md)). `POST …/compose` sends the
  prompt and the current spec. The model may call `inspect_tool` (read-only tools only, sampled output)
  to learn a tool's real output shape before writing JSONata, then returns `compose_changes`:
  sources, layout ops, new blocks (with their own `inputs`, `view`, and `fields`), placements,
  block patches/removals, and a page title.
- The server validates everything (structure, catalog, actions, read-only sources, brand policy)
  and then **dry-runs** it: every source is fetched and every view evaluated. Errors go back to the
  model (e.g. the exact JSONata parse error). The response carries the views from the dry run, so the
  result shows data immediately, plus CSS. The client applies the same changes with the shared
  `applyComposeChanges` and autosaves.

## Consequences

- Workspaces survive reloads, and edits, generated dialogs, and UI state persist.
- Generation still runs in stateless Worker routes; only storage moved to Durable Objects. Moving
  generation and data into the workspace's Durable Object (live updates, multiple clients) remains open.
- No sign-in yet: anyone with the URL can open a workspace, and there's one directory for everyone.
- Version history is stored but there's no undo/restore UI yet.
