/**
 * Builds @intent-ui/react: one ES module (the renderer and generated-page experience it uses
 * from this repo are bundled in; React, Kumo, Phosphor, JSONata and Zod stay external), type
 * declarations, and `styles.css` with every class it uses (Kumo tokens + Tailwind utilities, no
 * reset), so hosts without Tailwind get styled UI. Run with Bun: `bun packages/react/scripts/build.ts`.
 */
import { $ } from "bun";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compile } from "tailwindcss";

const pkg = resolve(dirname(new URL(import.meta.url).pathname), "..");
const root = resolve(pkg, "../..");
const modules = `${root}/node_modules`;

// React's production JSX runtime: hosts in production don't ship the development one (jsxDEV).
if (process.env.NODE_ENV !== "production") {
  console.error("Run with NODE_ENV=production (npm run sdk:build sets it).");
  process.exit(1);
}

await $`rm -rf ${pkg}/dist`;
const result = await Bun.build({
  entrypoints: [`${pkg}/src/index.ts`],
  outdir: `${pkg}/dist`,
  target: "browser",
  format: "esm",
  external: ["react", "react-dom", "react/*", "react-dom/*", "@cloudflare/kumo", "@cloudflare/kumo/*", "@phosphor-icons/react", "jsonata", "zod"],
  define: { "import.meta.env.DEV": "false" },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
if ((await Bun.file(`${pkg}/dist/index.js`).text()).includes("react/jsx-dev-runtime")) {
  console.error("The bundle uses React's development JSX runtime; build with NODE_ENV=production.");
  process.exit(1);
}

// CSS: compile exactly the classes the bundle and Kumo's components can use.
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(m?js)$/.test(name) ? [path] : [];
  });
const candidates = new Set<string>();
for (const file of [...files(`${pkg}/dist`), ...files(`${modules}/@cloudflare/kumo/dist`)]) {
  for (const token of readFileSync(file, "utf8").split(/[\s"'`]+/)) if (token && token.length < 200) candidates.add(token);
}
const input = `
@import "@cloudflare/kumo/styles/tailwind";
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
`;
const stylesheet = (id: string, base: string) => {
  if (id.startsWith(".")) return resolve(base, id);
  if (id === "@cloudflare/kumo/styles/tailwind") return `${modules}/@cloudflare/kumo/dist/styles/kumo.css`;
  if (id.startsWith("@cloudflare/kumo/styles/")) return `${modules}/@cloudflare/kumo/dist/styles/${id.split("/").pop()}.css`;
  return `${modules}/${id}`;
};
const compiler = await compile(input, {
  base: pkg,
  loadStylesheet: async (id, base) => {
    const path = stylesheet(id, base);
    return { path, base: dirname(path), content: readFileSync(path, "utf8") };
  },
});
await Bun.write(`${pkg}/dist/styles.css`, compiler.build([...candidates]));

await $`${root}/node_modules/.bin/tsc -p ${pkg}/tsconfig.build.json`.cwd(root);
console.log(`built ${result.outputs.map((o) => o.path.slice(root.length + 1)).join(", ")}, styles.css + types`);
