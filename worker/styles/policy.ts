/*
 * Brand policy for spec styles (ADR 0006). Any Tailwind class is allowed; what's checked is the
 * CSS it produces, so `bg-red-500` and `bg-[#f00]` are caught the same way. Rules:
 *  - colors come only from Kumo tokens (opacity modifiers like `bg-kumo-brand/50` are fine);
 *  - fonts and animations come only from the theme;
 *  - nothing escapes the page: no fixed positioning, z-index ≤ 10, no url() / background images;
 *  - no `dark:` (Kumo tokens already adapt to the color scheme).
 */

const MAX_CLASS_LENGTH = 120;
const MAX_Z_INDEX = 10;

/** Properties whose values are colors. */
function isColorProperty(property: string): boolean {
  return (
    /(^|-)color$/.test(property) ||
    ["background", "fill", "stroke", "--tw-gradient-from", "--tw-gradient-via", "--tw-gradient-to"].includes(property)
  );
}

/** Removes balanced `var(...)` groups from a value, returning the rest. */
function withoutVars(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value.startsWith("var(", i)) {
      let depth = 0;
      for (; i < value.length; i++) {
        if (value[i] === "(") depth++;
        else if (value[i] === ")" && --depth === 0) break;
      }
      continue;
    }
    out += value[i];
  }
  return out;
}

const COLOR_KEYWORDS = new Set(["color-mix", "in", "oklab", "oklch", "srgb", "transparent", "currentcolor", "inherit", "initial", "unset", "none"]);

/** A color value is on brand if it only references Kumo tokens (or Tailwind internals) and keywords. */
function isBrandColor(value: string): boolean {
  const vars = [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1] ?? "");
  if (!vars.every((name) => name.startsWith("--tw-") || name.includes("kumo-"))) return false;
  const words = withoutVars(value).toLowerCase().match(/[#a-z][\w#-]*/g) ?? [];
  return words.every((word) => COLOR_KEYWORDS.has(word));
}

/** Parses `property: value;` declarations out of a CSS snippet. */
function declarations(css: string): Array<[string, string]> {
  return [...css.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map((match) => [match[1] ?? "", (match[2] ?? "").trim()]);
}

/**
 * Checks one class against the policy, given the CSS Tailwind produces for it (null when
 * Tailwind doesn't know the class). Returns a fix-oriented message, or null when allowed.
 */
export function classIssue(token: string, css: string | null): string | null {
  if (token.length > MAX_CLASS_LENGTH) return `"${token}" is too long`;
  if (css === null) return `"${token}" isn't a Tailwind class`;
  if (css.includes("prefers-color-scheme")) return `"${token}": no dark: variants; Kumo tokens adapt to dark mode automatically`;
  if (/url\(/i.test(css)) return `"${token}": no url()/background images; use an img node`;
  for (const [property, value] of declarations(css)) {
    if (isColorProperty(property) && !isBrandColor(value)) {
      return `"${token}": colors must be Kumo tokens (e.g. bg-kumo-brand, text-kumo-subtle, border-kumo-line, from-kumo-info, ring-kumo-brand)`;
    }
    if (property === "font-family" && !/^var\(--font-/.test(value)) return `"${token}": fonts must come from the theme (font-sans, font-mono)`;
    if (property === "animation" && !/^(var\(--animate-[\w-]+\)|none)$/.test(value)) return `"${token}": only theme animations (animate-pulse, animate-spin, animate-ping, animate-bounce)`;
    if (property === "position" && value === "fixed") return `"${token}": no fixed positioning; it would escape the block`;
    if (property === "z-index" && Number(value) > MAX_Z_INDEX) return `"${token}": z-index must be ${MAX_Z_INDEX} or less`;
  }
  return null;
}
