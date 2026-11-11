/** Builds @intent-ui/build-plugin (Vite, webpack/Turbopack, Next.js entries) and its types. Run with Bun. */
import { $ } from "bun";
import { dirname, resolve } from "node:path";

const pkg = resolve(dirname(new URL(import.meta.url).pathname), "..");
const root = resolve(pkg, "../..");
await $`rm -rf ${pkg}/dist`;
const result = await Bun.build({
  entrypoints: ["vite", "webpack", "next", "core"].map((name) => `${pkg}/src/${name}.ts`),
  outdir: `${pkg}/dist`,
  target: "node",
  format: "esm",
  external: ["@babel/core", "vite"],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
await $`${root}/node_modules/.bin/tsc -p ${pkg}/tsconfig.build.json`.cwd(root);
console.log(`built ${result.outputs.map((o) => o.path.slice(root.length + 1)).join(", ")} + types`);
