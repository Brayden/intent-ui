# ADR 0017: Progressive compose — render the page as the model writes it

| | |
|---|---|
| **Status** | Accepted (compose and generated pages; other flows to follow) |
| **Date** | 2026-11-12 |
| **Relates to** | [ADR 0001](0001-spec-is-source-of-truth.md) (spec is the source of truth), [ADR 0008](0008-persistence-data-layer-and-compose.md) (compose), [ADR 0016](0016-prompt-caching-and-compact-tool-catalogs.md) (cost) |

## Context

Compose answers with one `compose_changes` tool call, validated and dry-run before anything is
shown. A typical page is 2–4k characters of JSON, about 10 seconds of model output, and the user
saw nothing until all of it was written, checked and fetched. We considered a compact text
format (like OpenUI Lang) to cut tokens, and JSONL to render progressively. Both are about the
wire format the model writes; we want progressive rendering without giving up JSON as the saved
format, tool use's schema-checked input, or the validation pipeline.

## Decision

1. **Stream the tool call, not a new format.** The tool loop can stream responses
   (`streamMessage`) and reports a final tool's input text as it grows. Saved documents, tool
   schemas and validation are unchanged.
   Streaming final tools set `eager_input_streaming: true` (fine-grained tool streaming).
   Without it the API buffers and validates each top-level parameter before sending it, so
   `newBlocks` (every block) arrived in one piece at the end and nothing streamed in practice.
   Fine-grained input isn't validated: a call whose input isn't valid JSON is sent back for
   repair like any invalid answer. If the API rejects the per-tool field, the request is retried
   once with the `fine-grained-tool-streaming-2025-05-14` beta header.
2. **Parse partial JSON, emit only complete pieces** (`worker/llm/partialJson.ts`). Unfinished
   strings, numbers and keys are left out, so an id or class name is never half-written; objects
   and arrays report when their closing bracket has arrived.
3. **Draft events, JSONL over server-sent events** (`worker/compose/stream.ts`,
   `shared/api/composeStream.ts`). With `Accept: text/event-stream`, `POST .../compose` sends one
   JSON event per line: each `source`, `layout` op and `node` once complete; a `block` header as
   it grows; `css` for new classes; `status` (inspecting a tool, searching, checking, fixing);
   `reset` when a repair attempt starts over; then `result` (the same validated response as
   before) or `error`. Requests without the header get the old JSON response.
4. **Early data.** When a block is complete and its sources are known, the Worker runs its view
   immediately and sends `view`. The fetch is memoized (`memoizedToolCaller`) and the final dry
   run reuses it, so streaming adds no tool calls.
5. **Drafts are never saved.** The client keeps the draft beside the workspace
   (`src/features/workspace/lib/composeDraft.ts`) and renders it in draft mode: missing nodes are
   placeholders, bound props without data render empty, and components show loading. Right-click
   editing is off while drafting. The validated `result` replaces the draft; an error or decline
   discards it.

6. **Generated pages open at once** (ADR 0011). `POST .../pages` streams the same way. The page
   id comes from the intent, not the model, so the first event is `page` with that id and the
   client navigates to it immediately; the user watches the page build at its own URL with the
   Building pill. `create_page` lists `title` and `params` first, so a second `page` event soon
   brings the title and the clicked item's route values, and the URL is updated in place
   (`/w/:id/:page?member=emp_1`). Then blocks and data stream as in compose.
   - **Declined or failed:** the user is taken back (history) and told why; nothing is saved.
   - **Left mid-build:** it finishes and saves anyway; a toast offers to open it.
   - **Clicked again mid-build:** joins the build instead of starting another.
   - **Reloaded mid-build:** the draft is gone (it lives in the tab), so the page explains that and
     offers "Build it again" (the request is kept in sessionStorage). Moving generation into the
     workspace's Durable Object, so builds survive reloads and other tabs can watch, is the
     follow-up.

## Consequences

- In a simulated run at ~70 output tokens/s (1.5 s to first token), a three-block page showed its
  first block at 3.8 s, its first data around 5 s and all blocks at 8 s, versus nothing until
  10 s before. Total time is unchanged; tokens are unchanged.
- A draft can briefly show something the final checks reject (structure rules, brand policy,
  dry-run failures). It's replaced by the repaired attempt (`reset`) or removed on error.
- Key order matters for how early things appear: the schema lists sources before blocks, and
  nodes before a block's view. The model usually follows it; if not, things just appear later.
- In the simulated run, a generated page opened 70 ms after the click, had its route values in
  the URL at 1.9 s, its first block at 3.8 s and data from 4.5 s; the result landed at 6.4 s.
- Not yet streamed: pointed edits, intent overlays (templates) and host edits. They can use the
  same `onToolInput` hook and `eventStream`.
