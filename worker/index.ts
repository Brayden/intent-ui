import type { Bindings } from "./env";
import { createIntentUIHandler } from "./handler";

/*
 * The standalone Intent UI app's Worker: static assets are served by Cloudflare (see
 * wrangler.jsonc); everything under /api is the Intent UI handler, for one local user with the
 * demo data.
 */
export { ConnectionsStore } from "./store/ConnectionsStore";
export { WorkspaceDirectory } from "./store/WorkspaceDirectory";
export { WorkspaceStore } from "./store/WorkspaceStore";

const intentUI = createIntentUIHandler({ basePath: "/api", demoData: true });

export default {
  async fetch(request, env): Promise<Response> {
    return (await intentUI(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Bindings>;
