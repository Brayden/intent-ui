# Intent UI

Apps that build themselves around what you ask for. Describe what you need, and Intent UI builds
a page from your connected data sources; click anything not built yet and it's generated on the
spot; right-click anything to change it. Everything is saved as you go.

## Stack

- React 19 + TypeScript on Vite, [Kumo](https://kumo-ui.com) components, Tailwind CSS v4
- Cloudflare Workers (static assets + `/api/*`) with SQLite-backed Durable Objects for storage
- Claude (Anthropic Messages API) for generation; JSONata for shaping data

## Getting started

You need Node.js 22 (or 20.19+) and an [Anthropic API key](https://console.anthropic.com/settings/keys).

1. **Add your key.** Create `.dev.vars` in the project root from the example, then paste your key
   after `ANTHROPIC_API_KEY=`:

   ```sh
   cp .dev.vars.example .dev.vars
   ```

2. **Start the app.** This runs Vite and the Worker (with its Durable Objects) locally:

   ```sh
   npm install && npm run dev
   ```

3. **Open [http://localhost:5173](http://localhost:5173).**

4. **Connect a data source (recommended).** Under **Connections** on the home page, add GitHub
   (with a personal access token), Linear or Cloudflare (sign in with OAuth), or any other MCP server
   by URL. Pick **Read only** to start; write tools stay off until you switch them on, and
   destructive ones always ask first. You can skip this and use the built-in demo HR data and web
   research instead.

5. **Click New workspace,** press **⌘K** (Ctrl+K on Windows/Linux), and describe what you want to
   build, e.g. *"Show my open GitHub pull requests and issues with how long each has been open."*
   Or click **Try the example** to start from a ready-made page.

6. **Shape it.** Once the page appears:
   - **Right-click** anything to change just that part ("only show ones open more than a week", "add a status badge").
   - **Mix data sources**, e.g. "add a column with the Linear ticket for each PR".
   - **Ask for things that don't exist yet**, like "a button that opens this person's profile page"
     or "a Create ticket button on each row". They're built the first time you click them and
     reused after that.

   Everything saves as you go, so reload any time and it's all still there.

### Other commands

```sh
npm run build          # typecheck + production build
npm run deploy         # build and deploy with wrangler (run `npx wrangler login` first)
npm run spec:check     # IAP schemas are fresh and the conformance suite passes (docs/spec)
```

To deploy, also set your key as a secret: `npx wrangler secret put ANTHROPIC_API_KEY`.

## Website

`site/` is the public site for the RFC (its own package; see [site/README.md](site/README.md)).

## Layout

```
src/
  app/                router (/ = workspaces, /w/:id = a workspace)
  features/home/      workspace list
  features/workspace/ a live workspace: state, autosave, data refresh, routes
  features/renderer/  spec renderer: layouts, blocks, Kumo wrappers + composites
  features/intents/   action runtime: deferred intents → overlays, tools, template library
  features/amend/     right-click "Change this…" edits
  features/command/   the ⌘K command menu (generate, actions, pages, workspaces)
  features/connections/ data connections: add, access level, tool switches, activity
  features/examples/  the example workspace spec (runs on the demo HR data)
shared/
  spec/               workspace spec schemas (zod) and pure spec operations
  catalog/            component catalog: props, validation, model-facing descriptions
  api/                request/response contracts between app and Worker
worker/               (handler.ts is the API as a mountable handler; index.ts the standalone app's Worker)
  routes/             /api/workspaces/*, /api/intents/*, /api/tools/call
  store/              Durable Objects: WorkspaceStore (one per workspace), WorkspaceDirectory
  data/               sources → JSONata → block views
  compose/            build/change pages from chat prompts (web search, tool inspection, dry run)
  research/           web research: citations log, refresh/replay, diffs, promotion to web/fetch
  intents/, amend/    generate overlays; pointed edits
  styles/             Tailwind in the Worker: brand policy + on-demand CSS
  llm/                Anthropic client, tool loop, shared prompt guides
  connections/        connections registry, gatekeeper policy, `web` (fetch/extract), demo HR
  mcp/                MCP client (Streamable HTTP + SSE) and OAuth 2.1
docs/                 RFCs and decision records (start with docs/README.md); docs/spec has the
                      IAP JSON Schemas, Kumo catalog and conformance suite
scripts/spec/         schema generator and conformance runner
site/                 the public RFC website (its own package)
packages/             SDK for embedding in Cloudflare-hosted React apps: @intent-ui/react, @intent-ui/server,
                      @intent-ui/build-plugin (see packages/README.md; `npm run sdk:build`)
examples/host/        a sample host dashboard using the SDK (`npm run dev:example`)
skills/               Project skills Claude follows while building (see CLAUDE.md)
```
