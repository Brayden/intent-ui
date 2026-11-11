# Intent UI docs

The documentation layer for Intent UI. Start with the founding RFC.

| Doc | What it covers |
|---|---|
| [RFC 0001: Intent-Driven Continuous Generative UI](rfcs/0001-continuous-generative-ui.md) | Product vision, core concepts, UI spec, continuous generation, data sources, security, delivery plan |
| [RFC 0002: Spec format v0](rfcs/0002-spec-format-v0.md) | **Accepted** (identity scope open). Freeform layouts + custom grids + slots, blocks, workspace sources, JSONata normalize/view, identity joins, composites, reload graph |
| [RFC 0003: Intents and Persistence](rfcs/0003-intents-and-persistence.md) | **Draft** (IAP v0.1, rev 2). Public, library-neutral spec: replayable page model, declared sources, deterministic clock, catalogs + bindings (Kumo example), deferred intents, change format, conformance levels. Schemas, Kumo catalog and conformance suite in [docs/spec](spec/README.md) |
| [ADR 0001: Spec is the source of truth](decisions/0001-spec-is-source-of-truth.md) | Deterministic reload: query → mapping → view model, expected schemas, item keys, joins, snapshots, versioning |
| [ADR 0002: Generate in a Worker route first](decisions/0002-generation-in-worker-first.md) | Stateless Worker + Anthropic via fetch + tool-call output + validate/repair; Durable Objects later |
| [ADR 0003: Template library and reuse](decisions/0003-template-library-and-reuse.md) | Workspace template library with descriptors; alias → reuse-or-generate → record; deterministic compatibility |
| [ADR 0004: Pointed edits](decisions/0004-pointed-edits.md) | Right-click → scoped ops (upsert/remove) or honest decline |
| [ADR 0005: Custom UI with structured HTML](decisions/0005-custom-ui-with-structured-html.md) | Catalog first; otherwise structured HTML (img/a with safe URLs) styled with Kumo tokens; allowed in blocks |
| [ADR 0006: Any Tailwind, brand on compiled CSS](decisions/0006-any-tailwind-brand-policy-on-css.md) | Any Tailwind class/variant; Kumo-only colors etc. enforced on compiled CSS; CSS compiled on demand in the Worker |
| [ADR 0007: User in control; chrome as data](decisions/0007-user-in-control-chrome-as-data.md) | `/meta` (title, sources, updatedAt, loading) + BlockUpdated/BlockSources; conventions are defaults, decline only when impossible |
| [ADR 0008: Persistence, data layer, compose](decisions/0008-persistence-data-layer-and-compose.md) | Durable Object per workspace + autosave; sources → JSONata → views in the Worker; blank page + chat that builds pages with a dry run |
| [ADR 0009: Web knowledge as replayable sources](decisions/0009-web-knowledge-as-replayable-sources.md) | Web search while building; tier 1 `web/fetch` recipes (deterministic) or tier 2 `research` sources (cited, replayable); promotion; diffs |
| [ADR 0010: The ⌘K command menu is the only chrome](decisions/0010-command-menu-is-the-only-chrome.md) | No top bar or chat bar; ⌘K Kumo CommandPalette to generate, run actions, switch workspaces; right-click prompt portaled above everything |
| [ADR 0011: Intents can open generated pages, with routes](decisions/0011-generated-pages-and-routes.md) | `/w/:id/:pageId?param=…`; page `params` read as `$route`; `intent` with `open: "page"` generates a page on first click and reuses it for every item; in-app `navigate` |
| [ADR 0012: Dynamic pages: route-driven data loaders](decisions/0012-dynamic-pages-route-driven-data.md) | Parameterized research (`{param}` placeholders, researched per value and cached); `pageParams`/`blockData` in compose; layout right-clicks go to compose; links fill params from the item |
| [ADR 0013: Interactive data: inputs drive the URL](decisions/0013-interactive-data-inputs-drive-the-url.md) | `TextInput` bound to `/ui` or `/route`; `set /route/x`; optional params; source `when`; partial reloads of route-dependent blocks |
| [ADR 0014: Data connections: remote MCP behind a thin gatekeeper](decisions/0014-data-connections-mcp-with-a-gatekeeper.md) | Remote MCP (Streamable HTTP); OAuth (discovery, DCR, PKCE, refresh) or token; per-user Durable Object; read/write policy, writes off by default, destructive confirm, activity log; real GitHub/Linear replace demo data |
| [ADR 0015: Connection access levels](decisions/0015-connection-access-levels.md) | Read only (default: read scopes only; every tool, even `execute`, is a read) or Read & write; per-tool "treat as read-only" |
| [ADR 0016: Prompt caching and compact tool catalogs](decisions/0016-prompt-caching-and-compact-tool-catalogs.md) | Cache system prompt + loop history; stable content only in system prompts; large tool catalogs listed one line each with `describe_tools` for schemas; usage logged |

## Conventions

- **RFCs** (`rfcs/NNNN-title.md`) propose larger designs. Status: Draft → Accepted → Superseded.
- **ADRs** (`decisions/NNNN-title.md`) record individual decisions made while implementing an
  RFC. Format is in `skills/engineering-standards/references/documentation.md`.
- When an ADR or later RFC changes something in RFC 0001, link it from that RFC's
  "Related documents" section.
