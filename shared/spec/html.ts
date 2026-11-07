import { z } from "zod";
import { GridTemplateSchema } from "./gridTemplate";
import { PathRefSchema, isPathRefLike } from "./values";
import { VisibilityConditionSchema } from "./visibility";

/*
 * Structured HTML for layouts and for custom UI inside blocks (ADR 0005). Never raw markup:
 * an allowlist of tags, a few typed attributes, allowlisted classes, and nothing that runs code.
 */

export const HTML_TAGS = [
  "div", "section", "header", "footer", "main", "aside", "nav", "article", "figure", "figcaption",
  "h1", "h2", "h3", "h4", "p", "span", "strong", "em", "small", "blockquote",
  "ul", "ol", "li", "hr", "img", "a",
] as const;
export type HtmlTag = (typeof HTML_TAGS)[number];

const VOID_TAGS: ReadonlySet<HtmlTag> = new Set(["img", "hr"]);

/** Image sources: https only (no data:, javascript:, or plain http). */
export function isSafeImageUrl(value: string): boolean {
  return /^https:\/\/[^\s"'<>]+$/i.test(value);
}

/** Link targets: https or mailto only. */
export function isSafeLinkUrl(value: string): boolean {
  return /^(https:\/\/|mailto:)[^\s"'<>]+$/i.test(value);
}

/**
 * Syntax-only check for class lists (ADR 0006). Any Tailwind class is allowed; the brand policy
 * (Kumo colors, no fixed positioning, …) is enforced on the server by compiling each class.
 */
export const ClassNameSchema = z.string().superRefine((value, ctx) => {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length > 80) ctx.addIssue({ code: "custom", message: "Too many classes (max 80)" });
  const bad = tokens.filter((token) => token.length > 120 || /["'<>`\\{};]/.test(token));
  if (bad.length > 0) ctx.addIssue({ code: "custom", message: `Invalid class syntax: ${bad.join(" ")}` });
});

const bindable = (schema: z.ZodType<string>) => z.union([schema, PathRefSchema]);

export const HtmlNodeSchema = z
  .object({
    kind: z.literal("html"),
    tag: z.enum(HTML_TAGS),
    className: ClassNameSchema.optional(),
    /** Custom grid tracks, applied via CSS variables (RFC 0002 §4.4). */
    grid: GridTemplateSchema.optional(),
    /** Text content; in blocks it may be a `{ path }` binding. */
    text: bindable(z.string()).optional(),
    /** `img` only: https image URL (or binding) and required alt text. */
    src: bindable(z.string().refine(isSafeImageUrl, "src must be an https URL")).optional(),
    alt: bindable(z.string()).optional(),
    /** `a` only: https or mailto URL (or binding). Always opens in a new tab. */
    href: bindable(z.string().refine(isSafeLinkUrl, "href must be an https or mailto URL")).optional(),
    children: z.array(z.string()).optional(),
    visible: VisibilityConditionSchema.optional(),
  })
  .superRefine((node, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (node.tag === "img" && (node.src === undefined || node.alt === undefined)) issue("img needs src and alt");
    if (node.tag !== "img" && (node.src !== undefined || node.alt !== undefined)) issue("src/alt are only for img");
    if (node.tag === "a" && node.href === undefined) issue("a needs href");
    if (node.tag !== "a" && node.href !== undefined) issue("href is only for a");
    if (VOID_TAGS.has(node.tag) && (node.children?.length || node.text !== undefined)) issue(`${node.tag} can't have text or children`);
  });
export type HtmlNode = z.infer<typeof HtmlNodeSchema>;

/** True if any field of an HTML node is a data binding (not allowed in page layouts). */
export function hasBindings(node: HtmlNode): boolean {
  return [node.text, node.src, node.alt, node.href].some(isPathRefLike);
}
