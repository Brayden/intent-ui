# Intent UI — guide for Claude

Websites declare intent-driven workflows; clients build continuously generative UI across
providers. Stack: React 19 + TypeScript + Kumo (`@cloudflare/kumo`) on Vite, served by a
Cloudflare Worker (`worker/`) with static assets. See `README.md` for commands.

## Product docs

`docs/` is the source of truth for what we're building and why. Read
`docs/rfcs/0001-continuous-generative-ui.md` before designing or building any feature, and
keep it current: when a decision changes the design, record an ADR in `docs/decisions/` and
link it from the RFC.

## Skills

Project skills live in `skills/` (also exposed to Claude Code via `.claude/skills`).
Read the relevant skill before starting work:

- `skills/engineering-standards/` — **always**, before writing, changing, or reviewing code.
  Covers modular structure, code quality, testing, and documentation hygiene.

## Kumo

Kumo ships an AI usage guide at `node_modules/@cloudflare/kumo/ai/USAGE.md` and a full
component registry at `node_modules/@cloudflare/kumo/ai/component-registry.md`. Check them
before building UI. Use semantic tokens (`bg-kumo-base`, `text-kumo-default`), never raw
Tailwind colors or `dark:` variants.

**Modals always use Kumo `LayerDialog`** (`@cloudflare/kumo/components/layer-dialog`), never
Kumo `Dialog`. This applies to hand-written UI and to generated UI: the catalog's `Dialog` type
renders a `LayerDialog`, and it's the only modal the model can use.

**Dialog actions** live in its footer (`LayerDialog.Actions`), at most 3: the dismiss button on the
left is the only cancel-type action (`dismissLabel`); one primary `LayerDialog.Action` on the
right (generated: a `DialogAction` child, or a `RecordForm`'s submit, which moves there
automatically); a secondary action goes in that action's split-button `menu`. Never a Cancel or
Save `Button` in the body (generation lint: `lintDialogActions`).

**Toasts:** use `useToasts()` from `src/lib/useToasts.ts`, never `useKumoToastManager()` directly. Kumo's
hook returns a new object every render, which breaks effect/callback dependencies (it caused an
infinite fetch loop).

**Generated UI styling** may use any Tailwind class; brand is enforced on the compiled CSS in
`worker/styles/policy.ts` (Kumo-token colors only, theme fonts/animations, no fixed/url()/dark:).
Change brand rules there, not with class allowlists (ADR 0006).

## Commands

- `npm run dev` — Vite + Worker dev server
- `npm run typecheck` / `npm run build` — must pass before a change is done
- `npm run deploy` — build and deploy with Wrangler
- `npm run spec:check` — the published IAP schemas are fresh and every conformance fixture passes
  (RFC 0003, `docs/spec`). Run it after changing anything in `shared/spec`, `shared/api/document.ts`,
  `shared/catalog` or `worker/data`; if the change is intended, regenerate with `npm run spec:schemas`
  and update the RFC with it.
