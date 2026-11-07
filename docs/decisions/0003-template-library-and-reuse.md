# ADR 0003: A workspace template library, with reuse checked before generating

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [RFC 0001](../rfcs/0001-continuous-generative-ui.md) §8.3 (deferred intents and materialization) |

## Context

Templates were cached per block + intent id. Intent ids and prompts are written by the model,
so the same need phrased differently ("Edit" in a row menu, "Edit profile" inside a generated
profile dialog) produced near-duplicate UIs that drifted apart. That costs latency and money,
and makes the app feel inconsistent.

## Decision

### 1. Templates live in one workspace-level library, with descriptors

Each template carries, besides its tree:

| Field | Source | Purpose |
|---|---|---|
| `summary` | Model (required in `emit_template`) | One sentence: what the UI does. Used to judge reuse. |
| `prompt`, `intentId` | Request | What it was first built for. |
| `itemFields` | **Derived** from the tree (`templateRequirements`) | `$item` fields it reads. |
| `tools` | **Derived** from the tree | `connection/tool` it calls. |

Requirements are always derived from the tree, never taken from the model, so compatibility
checks can't be talked around.

### 2. Resolving an intent, cheapest first

1. **Alias hit (no model call).** If this exact intent (`id` + `prompt`) resolved to a template
   before, and that template is compatible with the current item, render it immediately.
2. **Reuse or generate (one model call).** Otherwise, the client sends up to 12 **compatible**
   templates (newest first) as candidates. The model gets two tools:
   - `reuse_template { templateId, reason }` — preferred when a candidate serves the same purpose
     with the same data, even if worded differently. A template that does more than asked is fine;
     one that does something different isn't.
   - `emit_template { root, nodes, summary }` — only when nothing fits, and it must follow the
     conventions of the candidates so new UI stays consistent with existing UI.
3. **Record the result.** The template (new or reused) is stored, and the intent is aliased to it,
   so step 1 handles it next time.

### 3. Compatibility is deterministic

A template is a candidate only if every `itemFields` entry exists on the current item and every
tool it calls is available. The server re-checks a `reuse_template` choice against the same rule
and rejects (and repairs) anything else.

## Alternatives considered

- **Exact-key cache only** (previous behavior). Simple, but misses every rephrasing.
- **Embedding similarity on prompts.** Cheap at lookup, but similar wording ≠ same UI ("edit
  profile" vs "view profile"), and it needs a threshold to tune. Could later be used to rank
  candidates when the library is large.
- **A separate "should we reuse?" model call before generating.** Adds a round trip to every
  miss. Folding the choice into the generation call costs nothing extra when generating and is
  fast when reusing (the output is one short tool call).

## Consequences

- Rephrased intents converge on one template; repeated intents skip the model entirely.
- New templates are generated with existing ones as references, improving consistency.
- Candidates add input tokens to each miss; capped at 12. When libraries grow, rank candidates
  (embeddings, usage) before capping.
- The library is in client memory for now. It moves into the persisted spec (ADR 0001) with the
  workspace agent; the same mechanism will apply to blocks, not just overlays.
