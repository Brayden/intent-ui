import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE, type IntentUIPluginOptions } from "./core";

/** The parts of a Next.js config this helper touches. */
type NextConfig = {
  webpack?: (config: WebpackConfig, context: unknown) => WebpackConfig;
  turbopack?: { rules?: Record<string, unknown> };
  [key: string]: unknown;
};
type WebpackConfig = { module?: { rules?: unknown[] } };

/** Where the built loader lives (next to this file in dist). */
const LOADER = decodeURIComponent(new URL("./webpack.js", import.meta.url).pathname);

/**
 * Next.js: `export default withIntentUI({ ...yourConfig })`. Tags your components with both
 * bundlers Next can use: webpack (a "pre" rule) and Turbopack (a loader rule for .jsx/.tsx).
 */
export function withIntentUI(nextConfig: NextConfig = {}, options: Pick<IntentUIPluginOptions, "attribute" | "protectedComponents"> = {}): NextConfig {
  const loader = { loader: LOADER, options };
  return {
    ...nextConfig,
    webpack(config: WebpackConfig, context: unknown) {
      config.module ??= {};
      config.module.rules ??= [];
      config.module.rules.unshift({ test: DEFAULT_INCLUDE, exclude: DEFAULT_EXCLUDE, enforce: "pre", use: [loader] });
      return typeof nextConfig.webpack === "function" ? nextConfig.webpack(config, context) : config;
    },
    turbopack: {
      ...nextConfig.turbopack,
      rules: {
        ...nextConfig.turbopack?.rules,
        // Turbopack only runs loaders on files it'd otherwise compile itself (not node_modules).
        "*.tsx": { loaders: [loader] },
        "*.jsx": { loaders: [loader] },
      },
    },
  };
}
