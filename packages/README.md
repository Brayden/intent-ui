# Intent UI SDK

Add Intent UI to an existing React app on Cloudflare: users generate new pages, and right-click any
part of your own pages to change it, using your components and your data. Three packages:

| Package | What it is |
|---|---|
| [`@intent-ui/react`](react/) | `<IntentUIProvider>`, `<GeneratedPage>`, `<Protected>`, component bindings, settings, the master switch, and `styles.css` |
| [`@intent-ui/server`](server/) | The API as a Cloudflare Worker handler (generation, data sources, connections, customizations), stored in Durable Objects |
| [`@intent-ui/build-plugin`](build-plugin/) | Tags your JSX elements with stable ids so any part of a page can be customized. Vite, webpack, Turbopack, Next.js |

Requirements: React 18 or 19, a Cloudflare Worker (with `nodejs_compat`), and an Anthropic API key.

## 1. Server: mount the handler in your Worker

```ts
// worker.ts
import { createIntentUIHandler } from "@intent-ui/server";
export { WorkspaceStore, WorkspaceDirectory, ConnectionsStore } from "@intent-ui/server";

const intentUI = createIntentUIHandler({
  basePath: "/intent-ui/api",
  // Who's signed in, from your own session. Each user gets their own pages, connections and changes.
  session: async (request, env) => {
    const user = await getUserFromYourSession(request, env);
    return user ? { userId: user.id } : null; // null → 401
  },
  // Optional: your own API as tools, so generated UI can read (and, with confirmation, change) your data.
  tools: (request, env, session) => [myApiConnection(session.userId)],
});

export default {
  async fetch(request, env) {
    return (await intentUI(request, env)) ?? yourApp.fetch(request, env);
  },
};
```

```jsonc
// wrangler.jsonc (add to yours)
{
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [
      { "name": "WORKSPACES", "class_name": "WorkspaceStore" },
      { "name": "DIRECTORY", "class_name": "WorkspaceDirectory" },
      { "name": "CONNECTIONS", "class_name": "ConnectionsStore" }
    ]
  },
  "migrations": [{ "tag": "intent-ui-v1", "new_sqlite_classes": ["WorkspaceStore", "WorkspaceDirectory", "ConnectionsStore"] }]
}
```

Then `npx wrangler secret put ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`).

A tool from your API is a `Connection`: `{ id, name, tools: ToolInfo[], call(tool, args) }`, where
each `ToolInfo` has a name, description, JSON input schema, `readOnly`, and `destructive` (asks the
user to confirm). Read-only tools can feed generated UI's data; writes run only from a user's click.

## 2. Build plugin: tag your components

```ts
// Vite
import intentUI from "@intent-ui/build-plugin/vite";
export default defineConfig({ plugins: [intentUI(), react()] });

// Next.js (webpack and Turbopack)
import { withIntentUI } from "@intent-ui/build-plugin/next";
export default withIntentUI({ /* your config */ });

// webpack: add "@intent-ui/build-plugin/webpack" as an `enforce: "pre"` loader for .jsx/.tsx (not node_modules)
```

Elements inside `<Protected>` aren't tagged. Options: `protectedComponents` (your own wrappers that
also mean "protected"), `include`, `exclude`, `attribute`.

## 3. React: wrap your app

```tsx
import { IntentUIProvider } from "@intent-ui/react";
import "@intent-ui/react/styles.css"; // not needed if you use Tailwind + Kumo: @source the package instead

<IntentUIProvider
  endpoint="/intent-ui/api"          // where you mounted the handler
  shortcut="mod+shift+k"             // command menu on generated pages ("mod" = ⌘ / Ctrl; false = off)
  components={bindings}              // your components for catalog types (see react/BINDINGS.md)
>
  <App />
</IntentUIProvider>
```

The provider loads each user's customizations, places generated UI next to (or instead of) the
right elements as pages render and navigate, enables right-click editing, and hosts the settings
dialog. Then, wherever you like:

```tsx
// A fully generated page on one of your routes (omit id to start from scratch).
<Route path="/views/:id/*" element={<GeneratedPage basePath={`/views/${id}`} id={id} />} />

// Areas users can't change.
<Protected reason="Billing"><BillingSummary /></Protected>

// Your own entry points.
const { openSettings, openCommandMenu, mutationsEnabled, setMutationsEnabled } = useIntentUI();
```

- **Master switch:** off shows your app exactly as it ships. `?intent-ui=off|on` overrides it for
  one page view; `<html data-intent-ui="on|off">` reflects it for your CSS.
- **Styles:** `styles.css` has Kumo's tokens and every utility the SDK uses, without a CSS reset,
  so it won't restyle your app.

## Try it in this repo

`examples/host` is a sample dashboard using the SDK. From the repo root, run `npm run dev` (the
Intent UI Worker, port 5173) and `npm run dev:example` (port 5174), then open
http://localhost:5174. See [examples/host/README.md](../examples/host/README.md).

## Building the packages

`npm run sdk:build` (needs [Bun](https://bun.sh)) writes each package's `dist/`:
`@intent-ui/react` as one ES module with React, Kumo, Phosphor, JSONata and Zod as dependencies,
plus `styles.css` and types; `@intent-ui/server` as one ES module for Workers with everything
bundled, plus types; `@intent-ui/build-plugin` with its Vite, webpack and Next.js entries.

## Next

1. Hosts' own components as new catalog types (name, description, props schema, component),
   registered with the server handler so the model can use them.
2. Host page context for sources (account, zone), and inputs (e.g. a timeframe select) that
   change what sources load.
3. More customization operations: move, and props on components recognized as catalog types.
4. Fingerprints for re-finding targets after your releases change the page.
5. Plain REST APIs (from an OpenAPI document) as connections, next to MCP servers.
