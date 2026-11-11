import type { Plugin } from "vite";
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE, tagSource, type IntentUIPluginOptions } from "./core";

export type { IntentUIPluginOptions } from "./core";

/** Vite: `plugins: [intentUI(), react()]`. */
export default function intentUI(options: IntentUIPluginOptions = {}): Plugin {
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;
  let root = "";
  return {
    name: "intent-ui",
    // Before the React plugin compiles JSX away.
    enforce: "pre",
    configResolved(config) {
      root = config.root.replace(/\/+$/, "");
    },
    async transform(code, id) {
      const file = id.split("?")[0] ?? id;
      if (!include.test(file) || exclude.test(file) || !code.includes("<")) return null;
      const relative = file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file;
      const tagged = await tagSource(code, relative, { attribute: options.attribute, protectedComponents: options.protectedComponents });
      return tagged as { code: string; map?: null } | null;
    },
  };
}
