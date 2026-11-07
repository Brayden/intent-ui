# ADR 0007: The user is in control; block chrome is data and components, not fixed code

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Refines** | [ADR 0004](0004-pointed-edits.md), [RFC 0002](../rfcs/0002-spec-format-v0.md) §5.2 (block views) |

## Context

"Put the Updated label left of the Columns button" was declined: the frame drew the label in
code, so it could only be shown or hidden, and the model believed the timestamp wasn't
available, even though the refresh button drives that exact label. Two problems: the frame's
facts weren't exposed to the block's tree, and the prompt let our conventions read as limits.

## Decision

1. **Chrome facts are data.** Every block's scope has `/meta`: `{ title, sources, updatedAt,
   loading }`, computed from its inputs (the same values the frame and refresh state use).
   `meta`, like `ui`, is a reserved key in view models. Edit requests include `meta` in the data
   sample so the model can see it.
2. **Chrome parts are components.** `BlockUpdated` (freshness label with the refreshing state) and
   `BlockSources` (data-source badges) are catalog components. The frame renders the same
   underlying pieces, so a rebuilt label looks and behaves identically. Moving any chrome part is:
   hide it with a frame patch, place the component (or bind `/meta/...`) where the user wants it.
3. **The user is in control.** Every prompt states that our frame, catalog defaults, layout, and
   style guide are defaults, not limits. The model declines only when a request is truly impossible
   with the available data and tools, or would break an enforced rule (security, brand colors,
   positioning). When a close version is possible, it builds it and explains the difference instead
   of declining.

## Consequences

- Any part of a block's chrome can be moved, restyled, or recomposed by the user.
- New chrome facts (e.g. row counts, errors) should be added to `/meta` and, if useful, as components,
  rather than drawn only by the frame.
