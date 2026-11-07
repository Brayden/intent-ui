# ADR 0006: Any Tailwind class; brand enforced on the compiled CSS; CSS compiled on demand

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Supersedes** | [RFC 0002](../rfcs/0002-spec-format-v0.md) §4.1–4.2 (class allowlist + prebuilt safelist) |

## Context

The class allowlist kept generated UI on brand, but it restricted the *vocabulary*: every new
idea (hover effects, transitions, transforms, filters, animations) needed someone to add patterns
first, so the model declined reasonable requests ("give the image an effect on hover"). Brand is
really about colors, type, and feel, not about which utilities exist.

## Decision

1. **Any Tailwind v4 class and variant is allowed** in spec `className`s: transitions, transforms,
   filters, `hover:`/`focus:`/`group-hover:`/`motion-safe:`, arbitrary values, etc. The shared schema
   only checks syntax (no quotes, braces, etc.; ≤ 80 classes, ≤ 120 chars each).
2. **Brand is enforced on the CSS each class produces**, using Tailwind's own compiler in the Worker
   (`worker/styles`). Per class (`candidatesToCss`):
   - unknown to Tailwind → rejected;
   - color properties (incl. gradient stops, ring/shadow/outline colors) may only reference Kumo
     tokens (`var(--color-kumo-*)`, `var(--text-color-kumo-*)`) or Tailwind internals, so
     `bg-red-500`, `text-white`, `bg-[#f00]`, `shadow-red-500` are all caught the same way;
     opacity modifiers on tokens (`bg-kumo-brand/20`) are fine;
   - fonts and animations only from the theme; no `url()`; no `position: fixed`; `z-index ≤ 10`;
     no `dark:` (Kumo tokens already adapt).
   Violations go back to the model with a fix-oriented message.
3. **CSS is compiled on demand.** Every generate/edit response includes `css` for exactly the classes
   it uses (Tailwind `compile` + `build`, ~15–50 ms). The client injects it (deduplicated) before
   applying the change; Tailwind's cascade layers keep ordering correct. The prebuilt safelist and its
   Vite plugin are removed.
4. **"Feel" is guided, not enforced.** The prompt's style guide asks for Kumo-like results: rounded-lg/xl,
   hairline borders, soft shadows, 150–300 ms ease-out transitions, subtle hover effects, `motion-safe:`
   for large motion.

## Alternatives considered

- **Keep extending the allowlist.** Safe but always one request behind; the safelist grows with every
  variant × utility combination.
- **Tailwind in the browser** (`@tailwindcss/browser`). Flexible, but heavier on the client and it
  would style anything, with no brand check.

## Consequences

- Generated UI can use the full expressive range of Tailwind while staying on Kumo colors and type.
- The Worker bundles Tailwind's compiler and the Kumo/Tailwind theme CSS (imported with `?raw`).
- Each response carries ~20–25 KB of CSS, mostly theme variables already on the page. Optimization
  later: strip variables the page already defines, or persist compiled CSS with the spec.
- On reload with a persisted spec, the client will need `/api/styles` (or stored CSS) for classes not
  in the app's own source. To add with persistence.
