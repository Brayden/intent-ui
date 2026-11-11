/**
 * Builds @intent-ui/server: one ES module for Cloudflare Workers with every dependency bundled
 * (including the Tailwind and Kumo CSS the style checks need, inlined from `?raw` imports), plus
 * type declarations. Run with Bun: `bun packages/server/scripts/build.ts`.
 */
import { $ } from "bun";
import { dirname, resolve } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const pkg = resolve(here, "..");
const root = resolve(pkg, "../..");

await $`rm -rf ${pkg}/dist`;

const raw = {
  name: "raw",
  setup(build: import("bun").PluginBuilder) {
    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const spec = args.path.replace(/\?raw$/, "");
      const base = spec.startsWith(".") ? dirname(args.importer) : root;
      let path: string;
      try {
        path = Bun.resolveSync(spec.endsWith(".css") ? spec : `${spec}.css`, base);
      } catch {
        path = Bun.resolveSync(spec, base);
      }
      return { path, namespace: "raw" };
    });
    build.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({
      contents: `export default ${JSON.stringify(await Bun.file(args.path).text())};`,
      loader: "js",
    }));
  },
};

const result = await Bun.build({
  entrypoints: [`${pkg}/src/index.ts`],
  outdir: `${pkg}/dist`,
  target: "browser",
  format: "esm",
  // Provided by the Workers runtime (node:async_hooks needs the nodejs_compat flag).
  external: ["cloudflare:workers", "node:*"],
  plugins: [raw],
  minify: false,
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

await $`${root}/node_modules/.bin/tsc -p ${pkg}/tsconfig.build.json`.cwd(root);
console.log(`built ${result.outputs.map((o) => o.path.slice(root.length + 1)).join(", ")} + types`);
