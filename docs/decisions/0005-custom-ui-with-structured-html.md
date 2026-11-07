# ADR 0005: When no component fits, build it from structured HTML (on brand, never raw markup)

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-06 |
| **Supersedes** | [RFC 0002](../rfcs/0002-spec-format-v0.md) review decision #2 ("HTML in layouts only") |

## Context

Users ask for things the catalog doesn't have ("add a random picture as a banner"). The model
correctly declined because nothing could render an image. Intent UI builds custom software per
user, so "there's no component for that" shouldn't end the conversation. But letting a model emit
arbitrary HTML is an injection risk and would drift off brand.

## Decision

- **Catalog first, HTML second.** The model uses catalog components when they fit (consistent,
  data-aware). When none fits, it composes the UI from **structured HTML nodes**, styled with
  allowlisted Tailwind classes and Kumo color tokens, instead of declining.
- **HTML is allowed in blocks** as well as layouts. In blocks, `text`, `src`, `alt`, and `href` may
  be `{ path }` bindings; layouts stay static (bindings there are rejected). HTML and components
  nest in each other, subject to each component's children rules.
- **Structured, never raw.** A node is `{ kind: "html", tag, className?, text?, children?, visible? }`
  with typed attributes only:
  - Tags: `div section header footer main aside nav article figure figcaption h1–h4 p span strong
    em small blockquote ul ol li hr img a`. No `script`, `style`, `iframe`, `form`, inline styles,
    event handlers, or other attributes.
  - `img`: `src` must be `https:`; `alt` required; no children. Rendered with `loading="lazy"` and
    `referrerPolicy="no-referrer"`.
  - `a`: `href` must be `https:` or `mailto:`; always `target="_blank" rel="noopener noreferrer"`.
  - URLs are validated in the spec **and re-checked at render** (bound data could contain anything);
    unsafe images render nothing, unsafe links render as text.
- **Placeholder images** come from `https://picsum.photos/seed/<word>/<w>/<h>`; the model is told not
  to invent other image URLs and to prefer real URLs from data.
- **Styling stays on brand** through the brand policy on compiled CSS
  ([ADR 0006](0006-any-tailwind-brand-policy-on-css.md); originally a class allowlist).
- **Clear errors for repair.** Union validation errors report the closest branch's real issue
  (e.g. "tag must be one of …") rather than "Invalid input".

## Consequences

- Requests like banners, avatars, hero sections, and custom cards are now possible.
- External images are fetched by the user's browser from third-party hosts (privacy and
  availability). Later: proxy images through the Worker or restrict to allowlisted hosts.
- HTML that recurs is a signal to promote it into a catalog composite (and the template
  library can hold reusable custom pieces).
