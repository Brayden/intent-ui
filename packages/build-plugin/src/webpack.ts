import { tagSource, type IntentUIPluginOptions } from "./core";

/** The parts of webpack's (and Turbopack's) loader context this loader uses. */
type LoaderContext = {
  resourcePath: string;
  rootContext: string;
  async(): (error: Error | null, code?: string, map?: unknown) => void;
  getOptions?(): Partial<IntentUIPluginOptions>;
};

/**
 * webpack / Turbopack loader. Add it as a "pre" rule for your .jsx/.tsx files (excluding
 * node_modules), or use `withIntentUI` from "@intent-ui/build-plugin/next".
 */
export default function intentUILoader(this: LoaderContext, source: string): void {
  const callback = this.async();
  const options = this.getOptions?.() ?? {};
  const root = this.rootContext.replace(/\/+$/, "");
  const file = this.resourcePath.startsWith(`${root}/`) ? this.resourcePath.slice(root.length + 1) : this.resourcePath;
  if (!source.includes("<")) return callback(null, source);
  tagSource(source, file, { attribute: options.attribute, protectedComponents: options.protectedComponents })
    .then((result) => callback(null, result?.code ?? source, result?.map ?? undefined))
    .catch((error: Error) => callback(error));
}
