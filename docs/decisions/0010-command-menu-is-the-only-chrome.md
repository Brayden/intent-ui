# ADR 0010: The ⌘K command menu is a workspace's only app chrome

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Supersedes** | [ADR 0008](0008-persistence-data-layer-and-compose.md) "chat bar"; [RFC 0001](../rfcs/0001-continuous-generative-ui.md) §4.3 "a chat input is always present" |

## Context

A workspace had two pieces of fixed app chrome: a top bar ("← All workspaces" + autosave status)
and a chat bar pinned to the bottom. Both took space from, and sat on top of, the generated UI,
which is supposed to own the screen. They also sat above modals (fixed + z-index), covering them.

## Decision

- **No fixed chrome in a workspace.** The generated page gets the whole screen.
- **⌘K (Ctrl+K) opens a Kumo `CommandPalette`** (`src/features/command`), from anywhere,
  including over modals:
  - Type what you want and press Enter: the first row, "Generate", sends the text to compose
    (same flow as the old chat bar). The menu closes immediately; progress and the result show as
    a toast. If it fails or is declined, the text stays for the next ⌘K.
  - The same text filters the other rows: actions (refresh data, new blank workspace, all
    workspaces) and the user's other workspaces (fetched when the menu opens).
  - The footer shows the autosave status. Save errors also toast, as before.
- **A blank workspace opens with the menu already open**, plus a centered "What do you want to
  build?" with a button, so the first step doesn't depend on knowing the shortcut.
- **The right-click change prompt** is always the same floating box at the click point, portaled to
  `<body>` above everything, open modals included (this replaces ADR 0004's inline-in-overlay prompt).
- **App UI never outranks Kumo layers.** `#root` is its own stacking context (`isolation: isolate`),
  so z-indexes in the app can't rise above portaled Kumo layers (LayerDialog, menus, toasts).

## Consequences

- Discoverability rests on the shortcut and the blank-state hint. Touch devices have no ⌘K: on a
  non-empty page there's currently no way to open the menu without a keyboard. If that matters, add
  a gesture or a small, user-movable trigger (as user-editable chrome, per ADR 0007).
- The home page (`/`) is still where workspaces are deleted.
