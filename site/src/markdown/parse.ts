/*
 * A small GitHub-flavored Markdown parser: headings, paragraphs, fenced code, tables, nested
 * lists, block quotes, rules, and inline code, emphasis and links. It covers what our RFCs use,
 * produces plain data (no HTML strings), and renders through React, so nothing is injected.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { type: "heading"; level: number; id: string; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "code"; lang: string; value: string }
  | { type: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { type: "list"; ordered: boolean; start: number; items: Block[][] }
  | { type: "quote"; children: Block[] }
  | { type: "rule" };

const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^`\s]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +|$)/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const isBlank = (line: string) => line.trim() === "";
const indentOf = (line: string) => line.length - line.trimStart().length;

/** True if the line starts a block that interrupts a paragraph. */
function startsBlock(line: string, next: string | undefined): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    (LIST_ITEM.test(line) && !isBlank(line.replace(LIST_ITEM, ""))) ||
    isTableStart(line, next)
  );
}

function isTableStart(line: string, next: string | undefined): boolean {
  return line.includes("|") && next !== undefined && next.includes("-") && TABLE_DIVIDER.test(next);
}

/** Splits a table row on pipes that aren't escaped or inside code spans. */
function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i]!;
    if (char === "\\" && row[i + 1] === "|") {
      current += "|";
      i++;
    } else if (char === "`") {
      inCode = !inCode;
      current += char;
    } else if (char === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

/** GitHub's heading anchors: lowercase, punctuation dropped, spaces to hyphens. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

/** The plain text of inline content (for anchors and the table of contents). */
export function plainText(inlines: Inline[]): string {
  return inlines.map((node) => (node.type === "text" || node.type === "code" ? node.value : plainText(node.children))).join("");
}

export function parseMarkdown(source: string): Block[] {
  const slugs = new Map<string, number>();
  const uniqueSlug = (text: string) => {
    const base = slugify(text);
    const count = slugs.get(base) ?? 0;
    slugs.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
  return parseBlocks(source.replace(/\r\n?/g, "\n").split("\n"), uniqueSlug);
}

function parseBlocks(lines: string[], uniqueSlug: (text: string) => string): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const [, indent = "", marker = "```", lang = ""] = fence;
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith(marker)) {
        body.push(lines[i]!.startsWith(indent) ? lines[i]!.slice(indent.length) : lines[i]!.trimStart());
        i++;
      }
      i++; // closing fence
      blocks.push({ type: "code", lang: lang.toLowerCase(), value: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const children = parseInline(heading[2] ?? "");
      blocks.push({ type: "heading", level: heading[1]!.length, id: uniqueSlug(plainText(children)), children });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }

    if (isTableStart(line, lines[i + 1])) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]!).map((cell): Align => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        return left && right ? "center" : right ? "right" : left ? "left" : null;
      });
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && !isBlank(lines[i]!) && lines[i]!.includes("|")) {
        const cells = splitRow(lines[i]!);
        rows.push(head.map((_, column) => parseInline(cells[column] ?? "")));
        i++;
      }
      blocks.push({ type: "table", align: head.map((_, column) => align[column] ?? null), head: head.map(parseInline), rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && !isBlank(lines[i]!)) {
        body.push(lines[i]!.replace(QUOTE, ""));
        i++;
      }
      blocks.push({ type: "quote", children: parseBlocks(body, uniqueSlug) });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      i = parseList(lines, i, blocks, uniqueSlug);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    i++;
    while (i < lines.length && !isBlank(lines[i]!) && !startsBlock(lines[i]!, lines[i + 1])) {
      paragraph.push(lines[i]!.trim());
      i++;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
  }
  return blocks;
}

/** Parses a list starting at `start`, pushes it, and returns the index after it. */
function parseList(lines: string[], start: number, blocks: Block[], uniqueSlug: (text: string) => string): number {
  const first = LIST_ITEM.exec(lines[start]!)!;
  const baseIndent = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  const items: Block[][] = [];
  let i = start;

  while (i < lines.length) {
    const match = LIST_ITEM.exec(lines[i]!);
    if (!match || match[1]!.length !== baseIndent || /\d/.test(match[2]!) !== ordered) break;
    const contentIndent = baseIndent + match[2]!.length + Math.max(1, match[3]!.length);
    const body = [lines[i]!.slice(match[0].length)];
    i++;
    while (i < lines.length) {
      const line = lines[i]!;
      if (isBlank(line)) {
        // A blank line continues the item only if indented content follows.
        const next = lines.slice(i + 1).find((l) => !isBlank(l));
        if (next !== undefined && indentOf(next) >= contentIndent) {
          body.push("");
          i++;
          continue;
        }
        break;
      }
      if (indentOf(line) >= contentIndent) {
        body.push(line.slice(contentIndent));
        i++;
        continue;
      }
      // Lazy continuation of the item's paragraph.
      const previous = body[body.length - 1];
      if (previous !== undefined && !isBlank(previous) && !startsBlock(line, lines[i + 1])) {
        body.push(line.trim());
        i++;
        continue;
      }
      break;
    }
    items.push(parseBlocks(body, uniqueSlug));
    // Blank lines between items of the same list.
    let j = i;
    while (j < lines.length && isBlank(lines[j]!)) j++;
    const next = j < lines.length ? LIST_ITEM.exec(lines[j]!) : null;
    if (j > i && next && next[1]!.length === baseIndent && /\d/.test(next[2]!) === ordered) i = j;
  }

  blocks.push({ type: "list", ordered, start: ordered ? Number.parseInt(first[2]!, 10) : 1, items });
  return i;
}

/** Parses inline Markdown: code spans, links, strong and emphasis, escapes, autolinks. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  const text = (value: string) => {
    const last = out[out.length - 1];
    if (last?.type === "text") last.value += value;
    else if (value) out.push({ type: "text", value });
  };

  let i = 0;
  while (i < source.length) {
    const char = source[i]!;

    if (char === "\\" && /[\\`*_{}[\]()#+\-.!|<>~]/.test(source[i + 1] ?? "")) {
      text(source[i + 1]!);
      i += 2;
      continue;
    }

    if (char === "`") {
      let run = 1;
      while (source[i + run] === "`") run++;
      const ticks = "`".repeat(run);
      const end = source.indexOf(ticks, i + run);
      if (end > 0 && source[end + run] !== "`") {
        let value = source.slice(i + run, end).replace(/\n/g, " ");
        if (value.startsWith(" ") && value.endsWith(" ") && value.trim()) value = value.slice(1, -1);
        out.push({ type: "code", value });
        i = end + run;
        continue;
      }
      text(ticks);
      i += run;
      continue;
    }

    if (char === "<") {
      const auto = /^<(https?:\/\/[^\s>]+|mailto:[^\s>]+)>/.exec(source.slice(i));
      if (auto) {
        out.push({ type: "link", href: auto[1]!, children: [{ type: "text", value: auto[1]!.replace(/^mailto:/, "") }] });
        i += auto[0].length;
        continue;
      }
    }

    if (char === "[") {
      const close = matchingBracket(source, i);
      if (close > 0 && source[close + 1] === "(") {
        const end = source.indexOf(")", close + 2);
        if (end > 0) {
          const target = source.slice(close + 2, end).trim().split(/\s+/)[0] ?? "";
          out.push({ type: "link", href: target.replace(/^<|>$/g, ""), children: parseInline(source.slice(i + 1, close)) });
          i = end + 1;
          continue;
        }
      }
    }

    if ((char === "*" || char === "_") && source[i + 1] === char) {
      const marker = char + char;
      const end = source.indexOf(marker, i + 2);
      if (end > i + 2 && canOpen(source, i, char) && canClose(source, end + 1, char)) {
        out.push({ type: "strong", children: parseInline(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (char === "*" || char === "_") {
      const end = findSingle(source, i + 1, char);
      if (end > i + 1 && canOpen(source, i, char) && canClose(source, end, char)) {
        out.push({ type: "em", children: parseInline(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    text(char);
    i++;
  }
  return out;
}

const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

/** `_` only opens at a word start; both need non-space after them. */
function canOpen(source: string, at: number, char: string): boolean {
  const after = source[at + (source[at + 1] === char ? 2 : 1)];
  if (after === undefined || /\s/.test(after)) return false;
  return char === "*" || !isWordChar(source[at - 1]);
}

function canClose(source: string, at: number, char: string): boolean {
  const before = source[at - 1];
  if (before === undefined || /\s/.test(before)) return false;
  return char === "*" || !isWordChar(source[at + 1]);
}

/** The next single (not doubled) marker, skipping code spans. */
function findSingle(source: string, from: number, char: string): number {
  for (let i = from; i < source.length; i++) {
    if (source[i] === "`") {
      const end = source.indexOf("`", i + 1);
      if (end < 0) return -1;
      i = end;
      continue;
    }
    if (source[i] === char) {
      if (source[i + 1] === char) {
        i++;
        continue;
      }
      return i;
    }
  }
  return -1;
}

function matchingBracket(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "\\") i++;
    else if (source[i] === "`") {
      const end = source.indexOf("`", i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (source[i] === "[") depth++;
    else if (source[i] === "]" && --depth === 0) return i;
  }
  return -1;
}
