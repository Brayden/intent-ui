import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  // The RFC page imports the markdown from ../docs, so the dev server may read the repo root.
  server: { fs: { allow: [".."] } },
});
