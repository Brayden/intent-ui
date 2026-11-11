# Example host: Acme Cloud

A small stand-in for an existing product that adopts Intent UI through the SDK
(`packages/react`, `packages/build-plugin`). It shows:

- **Customizing the host's own pages:** right-click anything on Overview or Workers and describe a
  change. Try "hide this" on the Getting started banner, or select the Workers table ("Larger
  area" in the prompt walks up to it) and ask "show these as cards grouped by status". Replaced UI
  reads the original's live content, so it follows the host's data. With a data source connected
  in settings (e.g. Cloudflare), right-click the Workers card and ask "add a table listing my
  Cloudflare Workers". Right-click a customization
  to revise or remove it. Changes are saved through the Intent UI Worker.
- **Protected areas:** Billing is wrapped in `<Protected>`; right-clicking it explains it can't be
  changed.
- **Generated views:** "New view" in the sidebar opens a `<GeneratedPage>`. Press ⌘K and describe
  what you want; it's saved and listed under "Your views".
- **Settings:** "Intent UI settings" in the header: connect MCP servers, and list or remove this
  page's customizations.
- **The master switch:** the "Customizations" switch in the header, or `?intent-ui=off` in the URL,
  shows the host exactly as it ships.
- **Tagged host UI:** the Vite plugin adds `data-iui-id` to the host's elements (inspect them).
  Shift+right-click keeps the browser's menu.

## Run it

From the repo root, in two terminals:

```sh
npm run dev           # the Intent UI app + Worker on http://localhost:5173 (needs .dev.vars)
npm run dev:example   # this host on http://localhost:5174 (proxies /api to 5173)
```

Open http://localhost:5174.

OAuth connections currently return to the Intent UI app (5173) after sign-in rather than to this
host; token-based connections work from here. See `packages/README.md` for what's next.
