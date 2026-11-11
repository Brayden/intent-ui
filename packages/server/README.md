# @intent-ui/server

Intent UI's API as a Cloudflare Worker handler. See [../README.md](../README.md) for setup.

Exports `createIntentUIHandler(options)`, the three Durable Object classes to bind
(`WorkspaceStore`, `WorkspaceDirectory`, `ConnectionsStore`), and the `Connection` / `ToolInfo`
types for offering your own API as tools.

Options: `basePath` (default `"/api"`), `session(request, env)` (default: one local user),
`tools` (an array or a function of the request and session), `demoData` (default false).
The handler returns `null` for requests outside `basePath`, so your Worker handles them.
