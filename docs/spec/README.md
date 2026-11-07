# IAP spec artifacts

Machine-readable parts of [RFC 0003: Intents and Persistence](../rfcs/0003-intents-and-persistence.md)
(IAP v0.1 draft). The RFC is normative for behavior; these files are normative for shapes.

| Path | What it is |
|---|---|
| [`schema/document.schema.json`](schema/document.schema.json) | JSON Schema (2020-12) for an IAP document (RFC §3). |
| [`schema/change.schema.json`](schema/change.schema.json) | JSON Schema for a change (RFC §11.3). |
| [`schema/catalog.schema.json`](schema/catalog.schema.json) | JSON Schema for a component catalog (RFC §7.2). |
| [`catalogs/kumo-2.17.json`](catalogs/kumo-2.17.json) | The Kumo 2.17 catalog used by the reference implementation. |
| [`conformance/`](conformance/) | Conformance fixtures (RFC §13). Each names its level and the rule it tests. |

## Generated, not hand-written

The schemas and the Kumo catalog are generated from the Zod schemas in `shared/` so they can't
drift from the implementation:

```sh
npm run spec:schemas       # regenerate
npm run spec:conformance   # run every fixture against this implementation
npm run spec:check         # both, failing if the generated files are stale (use in CI)
```

Run a subset with `npm run spec:conformance -- render-02`. When a behavior change is intended,
`npm run spec:conformance -- --update <name>` rewrites that fixture's expectations from the
current output; review the diff before committing, since the fixtures are the spec.

## Fixture format

Every fixture has `name`, `level` (`L1` or `L2`), `rule` (the RFC section it tests), `kind`,
a `document`, and `expect`. Only the keys present in `expect` are compared; `issues` entries
match as substrings of the host's messages.

| Kind | Extra inputs | `expect` |
|---|---|---|
| `render` | `page`, `route`, `asOf`, `toolCalls` (matched on connection, tool and exact args) | `sources`, `views`, `render` (resolved trees, RFC §8.3), `unusedToolCalls` |
| `validate` | — | `valid`, `issues` |
| `change` | `change` | `accepted`, `document` or `issues` |
| `intent` | `intent`, `item`, `availableTools?` | `via` (`alias`, `candidates` or `materialize`), `template` or `candidates` |

To test another host, load each fixture, run the same steps with your implementation, and
compare. A host claims a level by passing every fixture at or below it.
