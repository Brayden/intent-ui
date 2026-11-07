# Intent UI

Apps that build themselves around what you ask for. Describe what you need, and Intent UI builds
a page from your connected data sources; click anything not built yet and it's generated on the
spot; right-click anything to change it. Everything is saved as you go.

## Stack

- React 19 + TypeScript on Vite, [Kumo](https://kumo-ui.com) components, Tailwind CSS v4
- Cloudflare Workers (static assets + `/api/*`) with SQLite-backed Durable Objects for storage
- Claude (Anthropic Messages API) for generation; JSONata for shaping data

## Getting started

```sh
npm install
cp .dev.vars.example .dev.vars   # then add your ANTHROPIC_API_KEY
npm run dev       # Vite + the Worker (and Durable Objects) in workerd
npm run build     # typecheck + production build
npm run deploy    # build and deploy with wrangler (run `npx wrangler login` first)
```

Open the app, then **New workspace** (blank, build it by chatting) or **Try the example**.

## Layout

```
src/
  app/                router (/ = workspaces, /w/:id = a workspace)
  features/home/      workspace list
  features/workspace/ a live workspace: state, autosave, data refresh, chat (compose) bar
  features/renderer/  spec renderer: layouts, blocks, Kumo wrappers + composites
  features/intents/   action runtime: deferred intents → overlays, tools, template library
  features/amend/     right-click "Change this…" edits
  features/examples/  the example workspace spec (runs on the mock connections)
shared/
  spec/               workspace spec schemas (zod) and pure spec operations
  catalog/            component catalog: props, validation, model-facing descriptions
  api/                request/response contracts between app and Worker
worker/
  routes/             /api/workspaces/*, /api/intents/*, /api/tools/call
  store/              Durable Objects: WorkspaceStore (one per workspace), WorkspaceDirectory
  data/               sources → JSONata → block views
  compose/            build/change pages from chat prompts (web search, tool inspection, dry run)
  research/           web research: citations log, refresh/replay, diffs, promotion to web/fetch
  intents/, amend/    generate overlays; pointed edits
  styles/             Tailwind in the Worker: brand policy + on-demand CSS
  llm/                Anthropic client, tool loop, shared prompt guides
  connections/        Connection interface, `web` (fetch/extract), mock HR, GitHub, Linear
docs/                 RFCs and decision records (start with docs/README.md)
skills/               Project skills Claude follows while building (see CLAUDE.md)
```
