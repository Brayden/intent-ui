import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Cloudflare plugin runs the Worker (worker/index.ts) inside workerd during
// `vite dev`, so the SPA and the /api routes share one dev server.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
});
