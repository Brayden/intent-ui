---
name: engineering-standards
description: Production-quality standards for Intent UI — modular file structure, code quality, documentation hygiene, and when (and how) to write tests. Use before writing or changing any code, adding a feature, refactoring, reviewing a change, or deciding whether something needs a test or a doc update.
---

# Engineering Standards

Intent UI is a production codebase: React 19 + TypeScript + Kumo on Vite, served by a
Cloudflare Worker. Every change should leave the code easier to read, change, and reuse
than it was before.

Read the reference file that matches what you're doing:

| Doing this | Read |
|---|---|
| Adding a feature, creating files, splitting something up | `references/modularity.md` |
| Deciding whether to test, or writing a test | `references/testing.md` |
| Writing a README, doc, comment, or ADR | `references/documentation.md` |

## Core principles

1. **Small, focused units.** One component, hook, or module does one job. Files are
   short enough to read in one sitting (see size budgets below).
2. **Compose, don't duplicate.** Build features out of reusable components, hooks, and
   pure functions. The second time you write something, extract it.
3. **Logic lives outside the view.** Components render; hooks manage state and effects;
   pure functions in `lib/` hold business logic. Pure logic is what's easy to test and reuse.
4. **Types are the contract.** Strict TypeScript, no `any`, no non-null `!` without a
   comment explaining why it's safe. Validate data at boundaries (network, storage,
   LLM output, URL params) with `zod`, and infer types from the schemas.
5. **Use the platform and the library.** Reach for Kumo components and semantic tokens
   before writing custom UI or raw Tailwind colors. Reach for Workers bindings before
   adding a dependency.
6. **Test what can break in ways that matter.** Not everything gets a test — see
   `references/testing.md`.
7. **Docs change with the code.** A change that alters behavior, setup, or architecture
   updates the matching doc in the same change.

## Size budgets

These are review triggers, not hard laws. Crossing one means stop and look for a split.

| Unit | Aim for | Split when over |
|---|---|---|
| Any source file | < 150 lines | 250 lines |
| React component (one file) | < 100 lines | 150 lines |
| Function / hook body | < 40 lines | 60 lines |
| Props on one component | ≤ 6 | 8 (group into an object or compose) |
| JSX nesting depth | ≤ 4 | 5 (extract a subcomponent) |

## Code quality rules

- **Naming:** components `PascalCase`, hooks `useCamelCase`, everything else `camelCase`;
  files match their main export (`IntentCard.tsx`, `useIntentStream.ts`, `parseIntent.ts`).
  Names say what a thing is or does — no `utils.ts`, `helpers.ts`, `misc.ts`, or `data2`.
- **Exports:** named exports everywhere except where a tool requires a default (`App.tsx`,
  the Worker entry). Each feature folder exposes its public surface through `index.ts`;
  other features import from that, never from deep inside.
- **Errors:** never swallow. Handle where you can recover, otherwise let it propagate to
  an error boundary (UI) or the Worker's top-level handler. Worker responses use a
  consistent `{ error: string }` shape with a correct status code.
- **Async UI:** every data-driven view handles loading, empty, and error states (Kumo
  has `Loader`, `Empty`, `Banner`).
- **Side effects:** no fetches or subscriptions in render; effects clean up after themselves.
- **No dead code:** remove unused exports, commented-out blocks, and stale TODOs. A TODO
  must say what and why (`// TODO(streaming): replace polling once SSE lands`).
- **Dependencies:** add one only if it saves real effort and is maintained. Say why in the
  change summary. Prefer what's already installed.
- **Accessibility:** interactive elements are real buttons/links with labels; Kumo's
  primitives handle focus and ARIA — don't rebuild them.
- **Secrets:** never in source. Use `.dev.vars` locally and Wrangler secrets in production.

## Before calling a change done

Run through this list. Fix anything that fails before reporting the work as finished.

- [ ] `npm run typecheck` passes with no new errors.
- [ ] `npm run build` succeeds.
- [ ] Tests pass, and any new logic that meets the bar in `references/testing.md` has a test.
- [ ] No file crossed a size budget without a reason stated in the summary.
- [ ] No duplicated logic that should be a shared component, hook, or function.
- [ ] Loading / empty / error states are handled for new async UI.
- [ ] Docs updated if behavior, setup, architecture, or a public interface changed.
- [ ] No `any`, stray `console.log`, commented-out code, or unexplained TODOs.

When summarizing a change, list: what changed, files added/split, tests added (or why none
were needed), and docs touched.
