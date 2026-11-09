# Intent UI site

The marketing site for [RFC 0003: Intents and Persistence](../docs/rfcs/0003-intents-and-persistence.md):
a home page and the RFC itself, rendered from the Markdown in this repo. React 19 + Vite +
[Kumo](https://kumo-ui.com), deployed as a Cloudflare Worker that serves static assets. `worker/index.ts` only handles media
files: it adds HTTP Range support, which Workers static assets lack, so videos can be scrubbed.

```sh
cd site
npm install
npm run dev       # local dev server
npm run build     # typecheck + production build
npm run deploy    # build and deploy with wrangler (run `npx wrangler login` first)
```

- `/` — hero and how it works (`src/pages/HomePage.tsx`)
- `/rfc` — the RFC (`src/pages/RfcPage.tsx`). It imports `docs/rfcs/0003-…md` at build time, so
  the page updates whenever the RFC does. Relative links resolve to GitHub (`src/config.ts`).
- `src/markdown/` — a small GFM parser and a renderer that uses Kumo's `Table`, `Link` and
  `CodeHighlighted`. It covers headings, tables, fenced code, nested lists, quotes and inline
  formatting; extend `parse.ts` if a document needs more.
