# Using your own components (bindings)

Generated UI is described with **catalog types** (`Text`, `Badge`, `Button`, `DataTable`, `Dialog`, …),
never with a specific component library. A **binding** tells Intent UI which of your components to
use for a type. Types you don't bind use the built-in Kumo implementations, so you can bind as few
or as many as you like.

## The short version

```tsx
import { defineBindings, formatValue, IntentUIProvider } from "@intent-ui/react";
import { Pill, Btn } from "@acme/design-system";

const bindings = defineBindings({
  Badge: ({ props }) => <Pill tone={props.variant}>{formatValue(props.text)}</Pill>,
  Button: ({ props, fireAction }) => (
    <Btn kind={props.variant} onClick={() => void fireAction()}>{props.label}</Btn>
  ),
});

<IntentUIProvider components={bindings}>…</IntentUIProvider>
```

That's it: everything Intent UI generates, on generated pages and in customizations of your own
pages, now uses `Pill` and `Btn`.

## Common questions

**Which types are there, and what does each one mean?**
`CatalogProps` (exported, fully typed) lists every type and its props. The same contract, with a
description of each type and when it fires its action, is in
[`docs/spec/catalogs/kumo-2.17.json`](../../docs/spec/catalogs/kumo-2.17.json). Your editor
autocompletes both the type names and each binding's props.

**What does a binding receive?**

| Prop | What it is |
|---|---|
| `props` | The type's props, already validated and with data bindings resolved (e.g. `props.rows` is the actual array). |
| `fireAction(item?)` | Runs the node's action (a click, a row click). Pass the row for actions on an item. |
| `childNodes` | The node's children as data: `{ id, type, props, children }`, e.g. a table's columns. |
| `renderNode(id, scope)` | Renders any child node with Intent UI's renderer (and your other bindings). |
| `node`, `nodeId`, `scope` | The raw node and its data scope, for advanced cases. |

**Do I have to support every prop?** Map what your component can show. Props you ignore just
don't appear. Keep the *meaning* of each type: a `Button` must call `fireAction()` when clicked, a
`Dialog` must close when dismissed. Validation, visibility, right-click editing and permissions
all happen before your component is called, so you don't reimplement any of that.

**What about types that contain other types?** Some children are drawn by their parent:
`DataColumn` (in `DataTable`), `MenuItem` (in `ActionMenu` and `DialogAction`), and `DialogAction`
(in `Dialog`). Bind the parent and read its children from `childNodes`. `defineBindings` warns in
development if you bind one of those directly.

**What does a full table binding look like?** Columns come from `childNodes`; a column with
`children` is a custom cell template, rendered once per row with the row as `$item`:

```tsx
DataTable: ({ props, node, childNodes, renderNode, scope, fireAction }) => {
  const columns = childNodes.filter((child) => child.type === "DataColumn");
  return (
    <AcmeTable>
      <thead>
        <tr>{columns.map((column) => <th key={column.id}>{String(column.props.header ?? "")}</th>)}</tr>
      </thead>
      <tbody>
        {(props.rows ?? []).map((row) => (
          <tr key={String(row[props.rowKey])} onClick={node.action ? () => void fireAction(row) : undefined}>
            {columns.map((column) => (
              <td key={column.id}>
                {column.children.length > 0
                  ? column.children.map((id) => renderNode(id, { ...scope, item: row }))
                  : formatValue(row[String(column.props.field)])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </AcmeTable>
  );
},
```

**Can the model use components I have that aren't in the catalog?** Not yet. The model and the
server's validator need to know a type's props and purpose, so new types will be declared once
(name, description, props schema, and your component) and registered with the server handler.
That's planned with the mountable server handler. Until then, bind your components to the
closest existing type.

**What if I don't use Kumo at all?** Bind the types you care about and leave the rest on the
defaults, which use Kumo. A future release ships the defaults' CSS so they work without Tailwind.

**Does a binding change what the model generates?** No. The model writes the same catalog types
either way; bindings only change how they're drawn. That's what lets one generated page render
in any product.
