import { __unstable__loadDesignSystem, compile } from "tailwindcss";
import { classIssue } from "./policy";

/*
 * Tailwind running in the Worker (ADR 0006): validates spec classes against the brand policy
 * and compiles CSS for exactly the classes a change uses, so generated UI can use any Tailwind
 * class without a prebuilt safelist. Pure apart from its stylesheet inputs, for testability.
 */

/** Stylesheets by import id: the Kumo theme and Tailwind's theme + utilities. */
export type Stylesheets = Record<string, string>;

const INPUT = [
  '@import "kumo-binding.css";',
  '@import "tailwindcss/theme.css" layer(theme);',
  '@import "tailwindcss/utilities.css" layer(utilities);',
].join("\n");

const loader = (sheets: Stylesheets) => async (id: string) => {
  const content = sheets[id];
  if (content === undefined) throw new Error(`Missing stylesheet "${id}"`);
  return { path: id, base: "/", content };
};

type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>;

export function createStyleEngine(sheets: Stylesheets) {
  let designSystem: Promise<DesignSystem> | undefined;
  const loadStylesheet = loader(sheets);

  return {
    /** Policy issues per class (only failing classes are returned). */
    async check(classes: string[]): Promise<Map<string, string>> {
      designSystem ??= __unstable__loadDesignSystem(INPUT, { base: "/", loadStylesheet });
      const unique = [...new Set(classes)];
      const css = (await designSystem).candidatesToCss(unique);
      const issues = new Map<string, string>();
      unique.forEach((token, i) => {
        const issue = classIssue(token, css[i] ?? null);
        if (issue) issues.set(token, issue);
      });
      return issues;
    },

    /** CSS for exactly these classes (plus the theme variables they use). */
    async css(classes: string[]): Promise<string> {
      if (classes.length === 0) return "";
      const compiler = await compile(INPUT, { base: "/", loadStylesheet });
      return compiler.build([...new Set(classes)]);
    },
  };
}

export type StyleEngine = ReturnType<typeof createStyleEngine>;
