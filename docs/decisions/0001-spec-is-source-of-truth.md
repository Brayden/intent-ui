# ADR 0001: The JSON spec is the source of truth, and reload is deterministic

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [RFC 0001](../rfcs/0001-continuous-generative-ui.md) §7 (UI specification), §8.1 (ops), §12 Q3 and Q6 |

## Context

Intent UI builds a workspace continuously from model-generated UI and live data from many
connected sources. When a user closes the page and comes back, the workspace must look the
same and put the right data in the right places, even though:

- data sources change (new rows, reordered results, changed tool output shapes);
- sources can be slow or temporarily unavailable;
- the model is non-deterministic, so regenerating UI on load would give a different result
  every time, cost money, and be slow.

## Decision

### 1. The persisted spec is the workspace

A workspace is fully described by declarative JSON: blocks (each a Kumo `UITree`), queries,
mappings, templates, join mappings, and persisted UI state. The op log is the history of how
that spec was built. **Nothing else is needed to reproduce a workspace.**

- The model **writes** the spec (through validated ops). It is **never called on reload.**
- Rendering, data fetching, mapping, and placement on reload are deterministic code.
- We never persist rendered output, generated code, or model transcripts as the workspace.

### 2. Data flows through three layers, and the UI binds only to the last

```
Query  ──►  Mapping  ──►  View model  ◄──  Elements bind by JSON Pointer path
```

| Layer | What it holds | Example |
|---|---|---|
| **Query** | Connection, tool, args (args may reference the view model or `$item`), target path | `github.search_prs { author: $item/githubLogin, state: "open" }` → `/members/*/prs` |
| **Mapping** | Declarative reshape of the raw tool result into our shape | `count` by `state` → `{ opened, merged, closed }` |
| **View model** | Data in the shape our UI depends on | `/members/3/prs/opened = 2` |

Elements never bind to a provider's raw response. When a provider's output changes, only the
mapping is affected, and it can be repaired without touching the UI.

### 3. Every query records the output shape it expects

Each query stores an **expected output schema**: the tool's declared output schema when the
MCP server provides one (`outputSchema` / `structuredContent`), otherwise a JSON Schema
inferred from the first successful result and saved with the query.

On every fetch, the raw result is validated against it:

- **Matches** → map and place.
- **Doesn't match** → the block is marked **stale** with a visible explanation; nothing is
  placed. The user (or the system, with consent) can trigger a **mapping-only repair**: the
  model regenerates the mapping for the new shape, and the UI tree is left alone.

We also store a **fingerprint of each tool's input/output schema**. A change in fingerprint
marks dependent queries and materialized templates for re-validation (RFC 0001 §12 Q6).

### 4. Every collection has a stable item key

Any array in the view model that's rendered as rows/items declares an **item key**
(`id`, `login`, `email`, …), chosen when the query is created. Keys are used for:

- reconciling rows across refreshes (React keys, preserving selection and expanded state);
- `forEach` queries (e.g. PRs per member) and their cached results;
- persisted per-item UI state.

If a source has no natural key, the mapping derives one deterministically (e.g. a hash of
fields that identify the item), and that derivation is saved with the mapping.

### 5. Cross-source joins are saved explicitly

When a query joins data from two sources (HR member → GitHub user), the join is stored as
data, not re-inferred:

- If the sources share a field (e.g. email), the join records that field pair.
- If they don't, the model **proposes** a mapping (e.g. `jane@acme.com → jdoe`), the user
  confirms it, and it's stored as a **join table** in the workspace. Unmatched items are shown
  as unmatched, not guessed.

### 6. Snapshots make reload instant, then data is revalidated

The last successful result of each query is stored (post-mapping, with a timestamp and the
schema fingerprint it was produced under). On reload:

1. Load the spec and render from snapshots immediately.
2. Re-run queries in the background according to their refresh policy.
3. Replace data as fresh results arrive; mark anything that failed or is stale, with its age.

If a source is unavailable, the workspace still opens with its last known state, clearly
labelled. Snapshots live in the workspace Durable Object alongside the spec; they inherit the
same isolation as connections and tokens.

### 7. Everything is versioned

Each spec records its **spec format version** and the **Kumo catalog version** it was
validated against. Upgrades go through explicit migrations. Combined with the op log, any
workspace can be replayed to any point in its history.

### 8. UI state: persist what users expect to persist

Persisted under `/ui/...` in the view model: sorting, filters, column visibility/width,
selected tab, collapsed sections. **Not** persisted: open dialogs, in-progress form input,
loading states, toasts.

### 9. Text-only tool results are explicitly non-deterministic

Some MCP tools return only prose. We handle them in this order of preference:

1. Use structured output if the tool provides it.
2. Parse text content that's valid JSON.
3. Otherwise mark the query **snapshot-only** (refreshed on demand), or opt it into a
   **model extraction step** on each refresh. Extraction-backed queries are labelled in the
   UI and the spec as non-deterministic, and are never the default.

## Alternatives considered

- **Regenerate the UI from chat history on reload.** Simple to build, but slow, costly,
  non-deterministic, and the UI would change between visits. Rejected.
- **Persist only data snapshots with the UI.** Reproduces the look but not live behavior;
  data goes stale with no way to refresh. Rejected as the primary model; kept as the
  instant-load layer on top of queries.
- **Bind elements directly to raw tool output paths.** Fewer layers, but every upstream
  schema change breaks the UI, and joins across sources have nowhere to live. Rejected.

## Consequences

**Easier:** instant, identical reloads; history, undo, and replay; sharing or forking a
workspace (copy the spec, re-authorize connections); testing the renderer and data layer with
fixtures and no model calls; isolating breakage when a provider changes.

**Harder:** we must design and maintain the mapping language (RFC 0001 §7.3, still open),
schema inference, staleness UX, and spec migrations. Every query the model creates must
include an item key and an expected schema, which adds to generation and validation.

**Follow-ups:**

- ADR on the mapping language (built-in transforms vs. sandboxed expressions).
- Spec format v0 definition (zod schemas in `shared/`), including queries, mappings, join
  tables, snapshots, and versions.
- Staleness and error UX for blocks.
