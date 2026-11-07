# RFC 0003: Intents and Persistence — a replayable page model for generative UI

| | |
|---|---|
| **Status** | Draft — IAP v0.1, open for review |
| **Author** | Brayden Wilmoth |
| **Created** | 2026-11-07 |
| **Last updated** | 2026-11-07 (rev 2: aligned with the reference implementation; schemas, change format and conformance suite published) |
| **Builds on** | [RFC 0001](0001-continuous-generative-ui.md), [RFC 0002](0002-spec-format-v0.md), ADRs [0001](../decisions/0001-spec-is-source-of-truth.md), [0003](../decisions/0003-template-library-and-reuse.md), [0008](../decisions/0008-persistence-data-layer-and-compose.md), [0011](../decisions/0011-generated-pages-and-routes.md)–[0015](../decisions/0015-connection-access-levels.md) |
| **Artifacts** | [JSON Schemas](../spec/schema/), [Kumo catalog](../spec/catalogs/kumo-2.17.json), [conformance suite](../spec/conformance/) — see [docs/spec](../spec/README.md) |

## Abstract

This document specifies **Intents and Persistence (IAP)**: a JSON document format and the host
behavior that lets a model-generated application be stored, reloaded and replayed predictably.
An IAP document describes **pages** (with typed route parameters), **sources** (how data is read
from tools, local values or web research), **blocks** (UI trees bound to a view computed from
sources) and **intents** (actions whose UI does not exist yet: it is generated the first time a
user invokes them, then persisted and reused).

IAP does not depend on a component library. UI trees use component types from a **catalog**, and
a host **binding** maps those types to whatever library it renders with. This document uses
[Kumo](https://kumo-ui.com) (`@cloudflare/kumo` 2.17) as the example binding.

The JSON Schemas in [`docs/spec/schema`](../spec/schema/) are normative for shapes. This document
is normative for behavior. Where they disagree, that is a bug in one of them; please report it.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as described in BCP 14
(RFC 2119, RFC 8174) when, and only when, they appear in capitals.

## 1. Motivation

Generative UI protocols today answer *how a model sends UI to a client*. They leave open:

1. **What is persisted?** After a reload, does the UI come back the same? Can it be shared?
2. **Where does data come from?** Most generated UIs inline data into the UI payload, so the UI
   goes stale and cannot be re-run against fresh data.
3. **What happens when the user asks for something that was never built?** A "details" row click
   should not need a model call every time.

IAP answers them with three rules:

- **The document is the source of truth.** What is rendered is a pure function of the document,
  the route, persisted UI state, the load's clock and source results. Re-rendering never needs
  anything a model said.
- **Data is declared, not embedded.** UI binds to a view computed from declared sources. A
  reload re-runs sources; it never re-runs the model.
- **Intents are deferred generation.** An action can carry an intent. The first invocation
  generates UI (a template). Every later invocation reuses it without a model call.

### 1.1 Relationship to other work

IAP is a persistence and data layer, designed to sit beside these, not replace them (as of
November 2026; these efforts move quickly):

| Work | What it covers | How IAP relates |
|---|---|---|
| [A2UI](https://a2ui.org) | Declarative component trees, catalogs, streaming updates | An IAP block tree is close to an A2UI surface. A host MAY stream IAP changes as A2UI messages. IAP adds pages, sources, persistence and intents. |
| [MCP](https://modelcontextprotocol.io) | Tools, OAuth-protected servers | IAP `tool` sources and actions call MCP tools through a host-side gatekeeper (§14). |
| MCP Apps | Server-provided HTML UI in sandboxed iframes | Complementary: an MCP App is opaque HTML; IAP UI is structured and editable. |
| [AG-UI](https://docs.ag-ui.com) | Agent ↔ frontend event transport | IAP is transport-agnostic; AG-UI can carry generation events. |
| WebMCP (W3C Community Group draft) | Sites exposing tools to in-browser agents | Conformance level L4 (§13) would let sites declare intents the same way. |

### 1.2 Non-goals

IAP does not specify a transport, prompts or model choice, visual styling, the authoring
experience, or how a model is asked to produce a change. Two conforming hosts may generate very
different UI for the same intent. Given the same document, binding and inputs (§11.2), they MUST
resolve it to the same tree (§8.3).

## 2. Terminology

| Term | Meaning |
|---|---|
| **Document** | The persisted JSON object this spec defines (§3). The reference implementation calls its `spec` a *workspace*. |
| **Host** | Software that stores documents, evaluates sources, renders UI and runs actions; usually a client plus a server. |
| **Catalog** | A versioned list of component types with prop schemas and structural rules. Library-neutral (§7.2). |
| **Binding** | A host's mapping from catalog types to concrete components, e.g. Kumo (§7.3). |
| **Source** | A declared way to read data: a tool call, a local value, or a research recipe (§5). |
| **View** | The JSON value a block renders, computed by a JSONata expression over the block's inputs (§6). |
| **Block** | A unit of UI mounted into a page slot: a component tree plus its inputs and view. |
| **Intent** | An action whose UI is generated on first use (§10). |
| **Template** | The persisted result of materializing an intent; reusable for later invocations. |
| **Materializer** | The host component (usually model-backed) that turns an intent into a template or a page. |
| **Change** | A validated edit to a document (§11.3). |
| **Load** | One evaluation of a page for a route: its sources, views and resolved trees (§5.5). |

## 3. The document

Schema: [`document.schema.json`](../spec/schema/document.schema.json).

```jsonc
{
  "iap": "0.1",                     // IAP version
  "version": 42,                     // +1 per accepted change (§11.4)
  "spec": {
    "specVersion": 0,                // document format revision; 0 for all IAP 0.x drafts
    "catalogVersion": "kumo@2.17",   // catalog id@version the trees were validated against
    "pages":   { /* id → Page, §4 */ },
    "blocks":  { /* id → Block, §6 */ },
    "sources": { /* id → Source, §5 */ }
  },
  "templates": [ /* Template, §10.2 */ ],
  "aliases":   { /* alias key → template id, §10.1 */ }
}
```

- Every map key MUST equal the `id` of the object it holds.
- A document MUST NOT contain secrets, access tokens or connection credentials. Connections are
  referenced by id only (§5.2).
- Fetched data appears in a document only as a `local` source's value or a `research` source's
  recorded result (§5.3–5.4). UI trees hold static text and bindings, never fetched data.
- `specVersion` becomes `1` at the first stable IAP release. Hosts MUST reject documents with a
  `specVersion` they don't support rather than guess.

## 4. Pages and routes

```jsonc
{
  "id": "artist",                    // ^[a-z0-9][a-z0-9-]*$
  "title": "Artist",
  "layout": {                        // static structure with slots; no data bindings
    "root": "shell",
    "nodes": {
      "shell": { "kind": "html", "tag": "main", "className": "grid gap-6", "children": ["main"] },
      "main":  { "kind": "slot" }
    }
  },
  "params": {
    "artist": { "description": "Artist name", "from": "name", "example": "Adele" },
    "tab":    { "description": "Selected tab", "optional": true }
  },
  "intent": { "id": "artist-profile", "prompt": "Go to this artist's profile" }
}
```

- A page is addressed by a **route**: a page id plus string values for its params. Hosts SHOULD
  put it in the URL (the reference implementation uses `/w/{doc}/{page}?artist=Adele`); the URL
  format is not normative.
- The first page (in key order) is the default page.
- `from` names the item field an opener fills the param from (e.g. a clicked row's `name`).
  `example` is a real value used to dry-run the page (§12). `optional` defaults to `false`.
- If a required param is missing, the host MUST render a recoverable empty state for the page and
  MUST NOT evaluate its sources.
- **Only declared params reach the document.** Before a load, the host MUST drop route values
  whose names the page doesn't declare. Sources and views read the rest as `$route.<name>`; block
  trees read them at `/route/<name>`.
- `intent` records which intent generated the page (§10.3).
- Layout nodes are `html` nodes (§7.1) without bindings, and `slot` nodes where blocks mount.
  Every node MUST be reachable from `root`, without cycles.

## 5. Sources

Sources live at document level and are shared: two blocks that read one source share one
evaluation, one result and one status per load.

### 5.1 Results

Evaluating a source yields a **result**: `status` (`ok`, `loading`, `stale`, `error` or
`auth_required`), `data`, `complete`, `fetchedAt`, and `error` (a message) when it failed.
A source with a `key` is a **collection**: its `data` MUST be an array of objects that each have
that field, and a host MUST wrap a single normalized object into a one-element array (and `null`
into `[]`).

### 5.2 `tool` sources

```jsonc
{
  "kind": "tool",
  "id": "repos",
  "connection": "github",              // a host-managed connection id (e.g. an MCP server)
  "tool": "list_repos",
  "inputs": { "user": "profile" },     // alias → source id
  "args": {
    "owner": { "expr": "$user.org" },  // JSONata over inputs and $route
    "per_page": 20                     // literal JSON
  },
  "when": "$user.org",                 // optional JSONata; falsy ⇒ no call (§5.5)
  "normalize": "$.{ \"name\": name, \"stars\": stargazers_count }",
  "key": "name",
  "schema": {}                         // JSON Schema of the normalized result ({} = unconstrained)
}
```

- `normalize` is JSONata evaluated with the tool's raw result as input.
- `args` values are JSON literals or `{ "expr": "…" }`. A literal object with a single `path`
  key is reserved; hosts MUST NOT resolve it.
- `args`, `when` and `normalize` MUST be evaluated with only the input aliases (as `$alias`) and
  `$route` bound. Nothing else in the document or the UI is visible to them.
- A `tool` source MUST be read-only. A host MUST refuse to evaluate one whose tool its gatekeeper
  classifies as a write or has switched off (§14).
- `connection` is opaque to the document. How it authenticates (MCP OAuth 2.1, a token, a
  built-in) is host business and MUST NOT appear in the document.
- `provenance` (§5.4) is present when the source was compiled from web research.

### 5.3 `local` sources

```jsonc
{ "kind": "local", "id": "aliases", "key": "login", "data": [{ "login": "ada", "name": "Ada Lovelace" }] }
```

A `local` source's value is part of the document. It changes only through a change (§11.3).

### 5.4 `research` sources

A research source is a **recipe plus its last result**: a web query and extraction instructions
a host can replay, and the rows it produced, with citations.

```jsonc
{
  "kind": "research",
  "id": "bio",
  "query": "biography of {artist}",          // {param} placeholders, filled from the route
  "instructions": "One row: born, origin, genres.",
  "preferSources": ["wikipedia.org"],
  "key": "artist",
  "schema": {},
  "params": ["artist"],                      // route params the recipe depends on
  "data": [{ "artist": "Adele", "born": "1988" }],
  "dataFor": { "artist": "Adele" },          // the values `data` was researched for
  "provenance": { "researchedAt": "2026-11-01T09:00:00Z", "citations": ["https://…"] }
}
```

- On load, a research source is served from recorded results. Without `params`, that is `data`.
  With `params`, the host serves `data` when the route values equal `dataFor`, and otherwise the
  result it recorded for those values, researching them once on first use.
- A host MUST cache per-values results, keyed by source id, recipe (`query`, `instructions`,
  `params`) and values, and MUST NOT re-research on load. Replays happen only on a user action
  (`research`, §9).
- Every result MUST carry provenance: when it was researched and https citations of the pages
  actually read. Hosts SHOULD show citations next to the data.
- Placeholders are `{name}` with `name` in `params`. Every name in `params` MUST be declared on
  every page whose blocks read the source (§12).

### 5.5 Evaluation

A **load** evaluates one page for one route:

1. Collect the page's blocks and every source they read, directly or through `inputs`.
2. Evaluate each source **at most once** per load, after its inputs. (The graph is acyclic; §12.)
3. If any input of a `tool` source isn't `ok`, the source's result is `error` and the tool is
   **not called**.
4. If `when` is present and falsy (`null`, `false`, `0`, `""` or `[]`), the tool is not called and
   the result is `ok` with `data` `[]` for a collection, else `null`.
5. A tool failure or an expression error makes that source's result `error`. It MUST NOT fail
   the load. Other sources and blocks continue.
6. Block views are evaluated after their inputs (§6).

When only route values or UI state change, a host SHOULD re-evaluate only the sources whose
`args` or `when` read `$route`, and the blocks that depend on them.

### 5.6 Determinism

JSONata (version 2.x) is the expression language for `normalize`, `when`, `args` expressions and
views. To keep loads replayable:

- Each load has one clock, **`asOf`**: an instant fixed when the load starts. Every `$now()` and
  `$millis()` in every expression of that load MUST return `asOf` (`$now(picture, tz)` formats
  it). Results' `fetchedAt` SHOULD be `asOf`.
- `$random()` MUST NOT be used. A host MUST reject documents that call it (§12) and MUST fail any
  evaluation that reaches it.
- Expressions see only the bindings listed in §5.2 and §6. A host SHOULD bound evaluation time
  (the reference implementation allows 1 s) and treat a timeout as an expression error.

## 6. Blocks and views

```jsonc
{
  "id": "repos-table",
  "page": "artist",
  "slot": "main",
  "order": 0,
  "title": "Repositories",
  "inputs": { "repos": "repos", "aliases": "aliases" },
  "view": { "expr": "{ \"rows\": $repos, \"count\": $count($repos) }", "schema": {} },
  "fields": { "count": { "label": "Repos", "definition": "Public repos owned by the org", "requires": ["repos"] } },
  "frame": { "style": "card", "title": true, "sources": true, "freshness": true },
  "ui": { "selected": [] },
  "root": "table",
  "toolbar": "refresh",
  "nodes": { /* §7.1 */ }
}
```

- `slot` MUST name a `slot` node in the page's layout. Blocks in a slot render in `order`.
- `view.expr` is JSONata with each input bound as `$alias` and the route as `$route`, and `{}` as
  input. A failed input is bound as `null`. The result is the block's **view model**.
- If the view throws, the block's view model is `null` and the block shows an error state.
  Other blocks are unaffected.
- `fields` documents computed values in plain language, for people and for later edits.
- `ui` is the block's **persisted UI state** (§8.1).
- `frame` is presentation chrome around the block; hosts MAY ignore what they can't show.
- `root` is the body; `toolbar`, when present, is a second tree root rendered in the block header.

## 7. UI trees and catalogs

### 7.1 Trees

A tree is a flat map of nodes keyed by id. A node is a **component node** or an **html node**:

```jsonc
"nodes": {
  "table": {
    "type": "DataTable",                                   // a catalog type
    "props": { "rows": { "path": "/rows" }, "rowKey": "name" },
    "children": ["c-name"],
    "action": { "name": "intent", "params": { "id": "repo-details", "prompt": "Show this repo's details" } },
    "visible": { "not": { "path": "/meta/loading" } }
  },
  "c-name": { "type": "DataColumn", "props": { "header": "Name", "field": "name" } },
  "note": { "kind": "html", "tag": "p", "className": "text-sm text-kumo-subtle", "text": { "path": "/summary" } }
}
```

- Any prop value, at any depth, may be a **binding** `{ "path": "<pointer>" }`. A pointer is a JSON
  Pointer (RFC 6901) into the block's scope (§8.1). Pointers starting `$item` (e.g.
  `$item/name`) read the current item of a repeating component (a table row).
- `action` (§9) and `visible` (§8.2) are reserved node fields.
- html nodes use an allow-list of tags (`div`, `section`, `header`, `footer`, `main`, `aside`,
  `nav`, `article`, `figure`, `figcaption`, `h1`–`h4`, `p`, `span`, `strong`, `em`, `small`,
  `blockquote`, `ul`, `ol`, `li`, `hr`, `img`, `a`) and typed fields: `className`, `grid`, `text`,
  `src` (`img`; https only; `alt` required), `href` (`a`; https or mailto), `children`, `visible`.
  There is no raw markup and nothing that runs code.

### 7.2 Catalogs

Schema: [`catalog.schema.json`](../spec/schema/catalog.schema.json). Example:
[`kumo-2.17.json`](../spec/catalogs/kumo-2.17.json).

```jsonc
{
  "id": "kumo", "version": "2.17",
  "components": {
    "Dialog": {
      "description": "A modal. Actions go in its footer, never as Buttons in the body…",
      "props": { /* JSON Schema */ },
      "children": "any",
      "childLimits": { "DialogAction": 1 },
      "overlay": true
    },
    "DialogAction": {
      "description": "The dialog's primary action, in its footer on the right…",
      "props": { /* JSON Schema */ },
      "parent": "Dialog",
      "children": ["MenuItem"],
      "childLimits": { "MenuItem": 1 },
      "action": "fired on click (e.g. a `tool` call, then the dialog closes on success)."
    }
  }
}
```

| Field | Meaning |
|---|---|
| `description` | What the component is for, written for people and models. |
| `props` | JSON Schema for the node's props after bindings are resolved. Defaults in it are applied by the binding. |
| `children` | `"none"`, `"any"`, or the list of allowed child types. |
| `parent` | The type, or types, this node may appear under. |
| `childLimits` | Maximum number of children per type. |
| `action` | Present if and only if the component fires its node's `action`; says when, and what `$item` is then. |
| `overlay` | The component can be the root of an overlay template (§10.2). |

A host MUST reject a tree that uses an unknown type, fails a props schema, or breaks `children`,
`parent`, `childLimits` or `action`. A document records the catalog it was validated against in
`catalogVersion`. A host that renders it with a different catalog version MUST re-validate and
SHOULD report the nodes that no longer validate instead of dropping them silently.

### 7.3 Bindings: any component library

A **binding** maps catalog types to components. It is host code, not part of the document, so
the same document can render with Kumo, shadcn/ui, MUI or a native toolkit. A binding MUST keep
the catalog's semantics (what each prop, child, action and limit means) and MAY differ in
appearance. A host SHOULD publish which catalog versions its binding supports.

Kumo binding (excerpt from the reference implementation):

| Catalog type | Kumo | Notes |
|---|---|---|
| `Dialog` | `LayerDialog` (`Root`, `Content`, `Title`, `Description`, `Body`, `Actions`) | `dismissLabel` → `LayerDialog.Actions dismissLabel`; dismissing writes `null` to the state its `visible` reads (§8.2). |
| `DialogAction` | `LayerDialog.Action` | One per dialog; a `MenuItem` child becomes the split-button `menu`. |
| `DataTable` / `DataColumn` | Kumo `Table` | `action` fires on row click or Enter, with `$item` = the row. |
| `TextInput` | Kumo `Input` | Writes to a `/ui/…` or `/route/…` path; `live` debounces writes. |
| `ActionMenu` / `MenuItem` | `DropdownMenu` | |
| `Text`, `Badge`, `Button`, `Stat`, `Stack`, `KeyValueList`, `RecordForm`, … | Kumo primitives and composites | See the catalog file for the full list. |

A shadcn/ui binding would map `Dialog` to `Dialog` + `DialogFooter`, `DialogAction` to a footer
`Button` (with a `DropdownMenu` for the split action), and `DataTable` to TanStack Table. The
document is unchanged.

## 8. State, conditions and resolution

### 8.1 Scope

A block's tree resolves pointers against its **scope**, an object with:

| Pointer | Contents | Written by |
|---|---|---|
| `/<field>` | The block's view model (if it is an object) | Never; computed (§6) |
| `/ui/…` | The block's `ui` state: selections, open dialogs, toggles | `set` actions, bound inputs |
| `/route/…` | The page's declared route values | `set` with a `/route/…` path, navigation |
| `/meta/…` | `title`, `sources` (connection ids), `updatedAt`, `loading`, `web` (research citations) | Host |
| `$item/…` | The current item inside a repeating component | Host |

`ui`, `route` and `meta` are reserved: view model fields with those names are shadowed.

`/ui` state is part of the document and persists. Put what a user should be able to share or
bookmark (a selected record, a search query) in `/route`, which lives in the URL. Overlay
templates have their own `/ui` state, which is not persisted.

### 8.2 Visibility

```
Condition := boolean
           | { "path": Pointer }                       // truthy
           | { "eq":  [DynamicValue, DynamicValue] }   // DynamicValue := JSON scalar | { "path": Pointer }
           | { "not": Condition }
           | { "and": [Condition, …] }
           | { "or":  [Condition, …] }
```

Truthiness is JavaScript's, except that empty arrays are false. A missing `visible` means
visible. Dismissing an overlay whose `visible` reads `/ui/…` or `/route/…` paths MUST write `null`
to those paths, so a dismissal is itself replayable state.

### 8.3 Resolution

Before handing a tree to its binding, a host **resolves** it. Given a tree and a scope:

1. Starting at `root` (and separately at `toolbar`), drop every node whose `visible` evaluates
   false, with its whole subtree, and remove it from its parent's `children`.
2. Replace every binding in `props` (and in html nodes' fields) with the value at its pointer.
   Missing values are `undefined` (the key is omitted).
3. Leave `$item` bindings, and `visible` conditions that read `$item`, as they are: the
   repeating component resolves them per item with the same rules.
4. Leave `action` params as authored. They resolve against the scope when the action fires.

Resolution is pure and deterministic. The conformance suite's `render` expectations are
resolved trees (§13).

## 9. Actions

An action is `{ "name": …, "params": { … } }`. Params may contain bindings; they resolve when the
action fires.

| Name | Params | Semantics |
|---|---|---|
| `set` | `path` (`/ui/…` or `/route/…`), `value`, `replace?` | Writes state. A `/route/…` write changes the URL and reloads route-dependent data; `replace` avoids a history entry. |
| `close` | — | Closes the current overlay. |
| `navigate` | `{ page, params? }` or `{ url }` | Goes to a page in the document; params not given are filled from `$item` by each param's `from`. A `url` (http/https) opens outside the app. |
| `refresh` | — | Reloads the page's sources, bypassing caches. |
| `research` | `source` | Replays a research recipe for the current values. |
| `tool` | `connection`, `tool`, `successMessage?`, …tool arguments | Calls a tool. See below. |
| `intent` | `id`, `prompt`, `open?` (`overlay` default, or `page`) | Deferred generation (§10). |

Rules for `tool` actions:

- Writes MUST only happen as a direct result of a user action. Loading, resolving and rendering
  MUST NOT write.
- The host MUST ask the user to confirm before calling a tool its gatekeeper marks destructive,
  whatever the document says.
- On success the host SHOULD reload sources on the same connection.

## 10. Intents and materialization

An intent is a promise of UI: the document records what the user will want; the host builds it
the first time.

### 10.1 Invocation

When an `intent` action fires with `id`, `prompt` and the current `$item`:

1. Compute the **alias key**: the JSON text of the array `[id, prompt]` with no whitespace
   (`JSON.stringify([id, prompt])`).
2. If `aliases[key]` names a template that is **compatible** with the item, render it.
   **No model call.**
3. Otherwise collect the compatible templates, newest first (the reference implementation keeps
   at most 12), and give them to the materializer, which MAY pick one instead of generating.
4. With none compatible, the materializer generates a template.
5. In cases 3–4, validate the result (§12), store it, and set the alias.

A template is compatible with an item when every field in its `itemFields` is a key of the item,
and every tool in its `tools` is currently available.

Steps 1–3 are deterministic and MUST NOT call a model. After first use, an intent is as fast
and predictable as any other action. The key is exact: a prompt with different wording is a
different intent, which still finds the old template as a candidate in step 3.

### 10.2 Templates

```jsonc
{
  "id": "tpl-repo",
  "intentId": "repo-details",
  "prompt": "Show this repo's details",
  "summary": "Repository details with stars and a link to GitHub.",
  "itemFields": ["name", "stars", "url"], // derived by the host
  "tools": [],                       // "connection/tool", derived by the host
  "root": "d",
  "nodes": {
    "d": { "type": "Dialog", "props": { "title": { "path": "$item/name" }, "dismissLabel": "Close" }, "children": ["kv", "go"] },
    "kv": { "type": "KeyValueList", "props": { "items": [{ "label": "Stars", "value": { "path": "$item/stars" } }] } },
    "go": { "type": "DialogAction", "props": { "label": "Open on GitHub" },
            "action": { "name": "navigate", "params": { "url": { "path": "$item/url" } } } }
  }
}
```

- An overlay template's root MUST be a catalog type with `overlay: true`.
- `itemFields` (top-level `$item` fields the tree reads) and `tools` (tools its actions call)
  MUST be derived by the host from the tree, never taken from the materializer's word.
- Templates read only `$item` and their own `/ui` state. They have no sources of their own in
  IAP 0.1; data they need beyond the item comes through tool actions.

### 10.3 Page intents

With `open: "page"`, the materializer produces a page (§4) and its blocks instead of a template.
The page's params use `from` to name the item fields that fill them, and its `intent` records the
intent, so later invocations navigate to it with the item's values instead of generating.
The host MUST dry-run the new page with its `example` values (§12) before accepting it.

## 11. Persistence and replay

### 11.1 What is stored

| Stored (in the document) | Recomputed per load | Never stored |
|---|---|---|
| Pages, layouts, params | Source results (except recorded research) | Credentials and tokens |
| Blocks, trees, views, block `ui` state | View models | Overlay `ui` state |
| Source declarations and local values | Resolved trees | Raw model output |
| Research recipes, results and citations | | |
| Templates and aliases | | |

### 11.2 Determinism

Given the same document `version`, catalog binding, route, `asOf`, and source results, every
conforming host MUST produce the same view models and resolved trees. Models are called only
when authoring (composing, editing, materializing an intent, replaying research on request),
never on load, navigation or refresh.

A **snapshot** is a document version plus the `asOf`, route and source results of one load.
Replaying a snapshot reproduces the load exactly. Hosts MAY store snapshots for audit or sharing.

### 11.3 Changes

Schema: [`change.schema.json`](../spec/schema/change.schema.json).

```jsonc
{
  "baseVersion": 42,
  "summary": "Added a details dialog",
  "ops": [
    { "op": "putSource", "source": { "kind": "local", "id": "team", "data": [] } },
    { "op": "blockOps", "block": "b", "ops": [
      { "op": "upsert", "id": "h", "node": { "type": "Text", "props": { "text": "Team" } } },
      { "op": "upsert", "id": "s", "node": { "type": "Stack", "props": {}, "children": ["h", "t"] } },
      { "op": "setRoot", "id": "s" } ] },
    { "op": "setAlias", "intent": { "id": "repo-details", "prompt": "Show this repo's details" }, "template": "tpl-repo" }
  ]
}
```

| Op | Effect |
|---|---|
| `putPage` / `removePage` | Add or replace a page / remove it and its blocks. |
| `layoutOps` | Apply `upsert`, `remove` (with subtree) and `setRoot` ops to a page's layout. |
| `putBlock` / `removeBlock` | Add or replace a block / remove it. |
| `blockOps` | Apply `upsert`, `remove` (with subtree), `setRoot` and `setToolbar` ops to a block's tree. |
| `putSource` / `removeSource` | Add or replace a source / remove it. |
| `putTemplate` / `removeTemplate` | Add or replace a template / remove it and the aliases that point at it. |
| `setAlias` | Point an intent at a template, or forget it (`null`) so the next invocation materializes. |

Ops apply in order, each to the result of the one before. An op that references something that
doesn't exist makes the whole change invalid. The result MUST pass full validation (§12) before
it is accepted. A change is atomic: all of it is applied, or none.

Hosts SHOULD save every user edit immediately as a change (autosave). There is no separate
publish step. Hosts MAY offer other internal APIs (the reference implementation's editor saves
whole documents) as long as the stored result is what the equivalent change would produce.

### 11.4 Versions and concurrency

Every accepted change increases `version` by exactly one. A change whose `baseVersion` isn't the
current version MUST be rejected, and the host SHOULD return the current document so the writer
can rebase. Hosts SHOULD keep recent versions so changes can be undone.

## 12. Validation

A host MUST reject a document, or a change whose result, fails any of:

1. **Schema.** It validates against `document.schema.json`.
2. **Catalog.** Every node passes §7.2. Layouts are static: no bindings in layout nodes.
3. **References.** Every block's page and slot exist; every block and source input names a
   source; every layout and tree node is reachable and acyclic; the source graph is acyclic.
4. **Params.** Every page whose blocks read a parameterized research source declares its params.
5. **Determinism.** No expression calls `$random()`.

A host MUST additionally **dry-run** output from the materializer or any model: evaluate the
affected page with its `example` route values and reject the change if a view or route write
it introduced fails. Hosts MAY apply **generation lints** to model output (for example, "a
dialog's actions belong in its footer"). Lints MUST NOT block saving a user's own edits.
Hosts MAY enforce a style policy on `className` values (the reference implementation allows
only Kumo design tokens).

## 13. Conformance

| Level | Name | A host at this level… |
|---|---|---|
| L1 | Render & replay | Validates documents and changes (§11–12), evaluates sources and views (§5–6), resolves trees (§8), runs `set`, `close`, `navigate`, `refresh` and `research`. |
| L2 | Deferred intents | L1, plus intent resolution, templates, aliases and validated materialization (§10). |
| L3 | Pointed edits | L2, plus targeted edits to a node, block or page from a user instruction, with history. |
| L4 | Provider intents | L3, plus intents and sources declared by a site or MCP server (e.g. via WebMCP), merged under the user's control. |

The [conformance suite](../spec/conformance/) is a set of JSON fixtures, each naming the rule it
tests. A host claims a level by passing every fixture at that level or below:

- **`render`** — a document, page, route, `asOf` and recorded tool calls (matched on connection,
  tool and exact arguments) → expected source results, view models and resolved trees.
- **`validate`** — a document → accepted or rejected, with issue text the host's messages must
  contain.
- **`change`** — a document and a change → the resulting document, or rejection.
- **`intent`** — a library, intent and item → alias hit, candidates, or materialize.

L3 and L4 have no fixtures yet; they are model-dependent and need a different style of test.

## 14. Security

- **Credentials stay in the host.** Documents reference connections by id. Tokens, OAuth state
  and client secrets MUST be stored server-side and never sent to a client or model.
- **Gatekeeper.** Every tool call passes a host-side policy: tools are classified read or write
  (from MCP annotations, otherwise a conservative heuristic); writes are off by default per
  connection; destructive tools need confirmation; and effective access accounts for what the
  user actually granted (OAuth scopes). The materializer MUST be told which tools are off, so it
  doesn't design around them.
- **User control.** Generated UI MUST NOT write without a user action, and the user can switch
  off any tool. Tool calls SHOULD be recorded in an activity log the user can read.
- **No code.** Documents contain no scripts and no raw HTML. Hosts MUST enforce the html node
  allow-list and its URL rules (§7.1), and MUST only open http(s) URLs from `navigate`.
- **Data minimization.** Materializers SHOULD receive the item's shape and the block's field
  definitions, not the item's values.

## 15. Worked example (Kumo)

A user connected GitHub and asked: "show my team's open PRs; clicking one shows details".

**After composing**, the document holds one source, one block, and an intent on the table:

```jsonc
{
  "iap": "0.1",
  "version": 3,
  "spec": {
    "specVersion": 0,
    "catalogVersion": "kumo@2.17",
    "pages": {
      "home": { "id": "home", "title": "Team PRs", "params": {},
        "layout": { "root": "main", "nodes": { "main": { "kind": "slot" } } } }
    },
    "sources": {
      "prs": {
        "kind": "tool", "id": "prs", "connection": "github", "tool": "search_pull_requests",
        "args": { "query": "is:open is:pr org:acme" },
        "normalize": "items.{ \"number\": number, \"repo\": $split(repository_url, \"/\")[-1], \"title\": title, \"author\": user.login, \"url\": html_url }",
        "key": "url", "schema": {}
      }
    },
    "blocks": {
      "prs-table": {
        "id": "prs-table", "page": "home", "slot": "main", "order": 0, "title": "Open pull requests",
        "inputs": { "prs": "prs" },
        "view": { "expr": "{ \"rows\": $prs }", "schema": {} },
        "ui": {},
        "root": "t",
        "nodes": {
          "t": { "type": "DataTable", "props": { "rows": { "path": "/rows" }, "rowKey": "url" },
                 "children": ["c1", "c2"],
                 "action": { "name": "intent", "params": { "id": "pr-details", "prompt": "Show this pull request's details" } } },
          "c1": { "type": "DataColumn", "props": { "header": "Title", "field": "title", "subField": "repo" } },
          "c2": { "type": "DataColumn", "props": { "header": "Author", "field": "author" } }
        }
      }
    }
  },
  "templates": [],
  "aliases": {}
}
```

**On load**, the host calls `github/search_pull_requests` once, normalizes the result into a
list keyed by `url`, evaluates the view, and resolves the tree: `rows` becomes the list; the
intent action stays as authored.

**The first row click** finds no alias for `["pr-details","Show this pull request's details"]`
and no compatible template, so the materializer generates one. The host derives
`itemFields: ["author", "title", "url"]`, validates it, and applies a change:

```jsonc
{
  "baseVersion": 3,
  "summary": "Pull request details",
  "ops": [
    { "op": "putTemplate", "template": {
        "id": "tpl-pr", "intentId": "pr-details", "prompt": "Show this pull request's details",
        "summary": "Title, author and a link to the pull request.",
        "itemFields": ["author", "title", "url"], "tools": [],
        "root": "d",
        "nodes": {
          "d":  { "type": "Dialog", "props": { "title": { "path": "$item/title" }, "dismissLabel": "Close" }, "children": ["by", "go"] },
          "by": { "type": "Text", "props": { "text": { "path": "$item/author" }, "prefix": "Opened by ", "variant": "secondary" } },
          "go": { "type": "DialogAction", "props": { "label": "Open on GitHub" },
                  "action": { "name": "navigate", "params": { "url": { "path": "$item/url" } } } }
        } } },
    { "op": "setAlias", "intent": { "id": "pr-details", "prompt": "Show this pull request's details" }, "template": "tpl-pr" }
  ]
}
```

**Every later click** resolves the alias, finds `tpl-pr` compatible with the row, and renders it,
with no model call. With the Kumo binding, `Dialog` renders as `LayerDialog` with "Close" on
the left of the footer and "Open on GitHub" (`LayerDialog.Action`) on the right. A shadcn/ui
binding would render the same template as its own dialog.

## 16. Open questions

1. **Catalog interchange.** Should IAP adopt A2UI's catalog format instead of §7.2? They're
   close; sharing one would let bindings work across both.
2. **Expression language.** JSONata is normative in 0.1. Should a host be able to declare a
   lighter alternative for simple views?
3. **Alias keys.** Exact prompt text makes rewording an intent fall back to candidates (§10.1).
   Should the key be the intent id alone, with the prompt as a hint?
4. **Template data.** Templates read only `$item` in 0.1 (§10.2). Should they be able to declare
   sources, e.g. "this PR's review comments"?
5. **Portable connections.** Connection ids are host-local. Do documents need a portable
   requirement (an MCP server URL plus tool names) so they can move between hosts?
6. **Template staleness.** When a source's shape changes, how are templates that read it
   flagged or regenerated?

## Appendix A. Reference implementation

The Intent UI prototype implements L1–L3 and passes all 28 L1 and L2 conformance fixtures,
including three built from the worked example in §15.

| Concern | Where |
|---|---|
| Document and change schemas (Zod; JSON Schemas generated from them) | `shared/spec/*`, `shared/api/document.ts` |
| Change application, intent resolution | `shared/api/document.ts` (`applyChange`, `resolveIntent`) |
| Cross-reference validation (§12.3–12.5) | `shared/spec/documentIssues.ts` |
| Catalog and validation | `shared/catalog/*` |
| Tree resolution (§8.3) | `shared/spec/resolve.ts` (`renderTree`) |
| Source evaluation and the load clock (§5.5–5.6) | `worker/data/{sources,views,jsonata}.ts` |
| Kumo binding | `src/features/renderer` |
| Change and export endpoints | `POST /api/workspaces/:id/changes`, `GET /api/workspaces/:id/document` |
| Generators and runner | `npm run spec:schemas`, `npm run spec:conformance`, `npm run spec:check` |

Known differences from this draft:

- The editor saves whole documents through a host-internal endpoint; the change endpoint is used
  for interchange. Both go through the same validation and version check.
- Snapshots (§11.2) are not stored yet.
- Materialized pages (§10.3) are applied through the compose pipeline, not as a change.
