import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import intentUI from "../../packages/build-plugin/src/vite";

/*
 * A stand-in for an existing product (think a cloud dashboard) that adopts Intent UI through the
 * SDK. It talks to the Intent UI Worker from this repo: run `npm run dev` (port 5173) first;
 * /api is proxied there.
 */
export default defineConfig({
  plugins: [intentUI(), react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: { "/api": "http://localhost:5173" },
    // The SDK imports the renderer from this repo's src/ (scaffold), outside this folder.
    fs: { allow: ["../.."] },
  },
});
