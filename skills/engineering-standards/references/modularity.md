# Modularity & File Structure

The goal: anyone (human or Claude) can find where something lives by its name, change it
without reading unrelated code, and reuse it elsewhere without copying.

## Project layout

```
src/
  app/            App shell: providers, routing, layout, error boundary
  features/       One folder per product capability (vertical slices)
    <feature>/
      components/ UI used only by this feature
      hooks/      State + effects for this feature
      lib/        Pure logic for this feature (no React, no I/O)
      api.ts      Client calls to the Worker for this feature
      types.ts    zod schemas + inferred types for this feature
      index.ts    Public surface — the only file other features import
  components/     Shared UI composed from Kumo, used by 2+ features
  hooks/          Shared hooks used by 2+ features
  lib/            Shared pure logic used by 2+ features
worker/
  index.ts        Entry: routing only — delegates to route handlers
  routes/         One file per route group (e.g. intents.ts)
  services/       Integrations and business logic (providers, storage)
  lib/            Shared pure helpers for the Worker
shared/           Types and schemas used by BOTH src/ and worker/ (create when first needed)
```

Create folders only when there's something to put in them. Don't scaffold empty trees.

## Where does this code go?

- Renders UI? → a component. Only this feature uses it → `features/<f>/components/`.
  Two or more features use it → `components/`.
- Holds state, effects, or subscriptions? → a hook.
- Transforms data, makes decisions, parses, formats, validates? → a pure function in `lib/`.
- Talks to the network? → `api.ts` (client) or `worker/services/` (server). Components
  never call `fetch` directly.
- Describes data shape crossing a boundary? → a zod schema in `types.ts` (or `shared/`).

## Promotion rule

Start local. Code moves "up" (feature → shared) the moment a second feature needs it —
not before. Moving it is part of the change that introduced the second use.

## Splitting a large component

When a component crosses its budget, split in this order:

1. **Extract logic** into a hook (`useThing`) — state, effects, derived values.
2. **Extract pure functions** the hook or JSX uses into `lib/`.
3. **Extract subcomponents** for distinct visual regions (header, list, item, footer).
4. **Use composition** (children, render props, compound components like Kumo's
   `Dialog.Root` / `Dialog.Trigger`) instead of adding more boolean props.

Signs a split is overdue: boolean props that switch whole branches of JSX, more than ~3
`useState` calls, a `useEffect` that does two unrelated things, or scrolling to understand
one component.

## Composable component design

- Accept `className` and pass it through with Kumo's `cn()` so callers can adjust layout.
- Prefer `children` and slots over configuration props.
- Keep components controlled-or-uncontrolled consistently (`value` + `onValueChange`,
  matching Kumo's conventions).
- Don't fetch inside reusable components — take data as props; let a feature-level
  container or hook fetch.

## Imports

- Features import other features only via their `index.ts`.
- Shared code (`components/`, `hooks/`, `lib/`) never imports from `features/`.
- `lib/` never imports React or does I/O.
- The Worker never imports from `src/`, and `src/` never imports from `worker/`; both may
  import from `shared/`.
