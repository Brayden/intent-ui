import { TableOfContents, useTableOfContentsActiveId } from "@cloudflare/kumo";
import { useEffect, useMemo } from "react";
import source from "../../../docs/rfcs/0003-intents-and-persistence.md?raw";
import { REPO_BRANCH, REPO_URL, RFC_PATH } from "../config";
import { Markdown } from "../markdown/Markdown";
import { parseMarkdown, plainText, type Block } from "../markdown/parse";

/** Resolves a link in the RFC: anchors and absolute URLs as-is, repo-relative paths to GitHub. */
function resolveHref(href: string): string {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [path = "", hash] = href.split("#");
  const parts = RFC_PATH.split("/").slice(0, -1);
  for (const segment of path.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment && segment !== ".") parts.push(segment);
  }
  return `${REPO_URL}/blob/${REPO_BRANCH}/${parts.join("/")}${hash ? `#${hash}` : ""}`;
}

type Section = { id: string; title: string };

/*
 * The public presentation of the RFC. In this repo it's RFC 0003, built on internal RFCs and ADRs;
 * on the site it's the first public RFC and stands alone.
 */
const PUBLIC_NUMBER = "RFC 0001";
/** Header rows that point at internal RFCs and ADRs. */
const HIDDEN_HEADER_ROWS = new Set(["Builds on"]);
/** Top-level sections that only matter inside this repo. */
const HIDDEN_SECTIONS = [/^Appendix A\b/];

function forPublic(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let hiding = false;
  let seenTable = false;
  for (const block of blocks) {
    if (block.type === "heading" && block.level <= 2) hiding = HIDDEN_SECTIONS.some((pattern) => pattern.test(plainText(block.children)));
    if (hiding) continue;

    if (block.type === "heading" && block.level === 1) {
      const [first, ...rest] = block.children;
      const renamed = first?.type === "text" ? [{ ...first, value: first.value.replace(/^RFC \d{4}/, PUBLIC_NUMBER) }, ...rest] : block.children;
      out.push({ ...block, children: renamed });
    } else if (block.type === "table" && !seenTable) {
      seenTable = true;
      out.push({ ...block, rows: block.rows.filter((row) => !HIDDEN_HEADER_ROWS.has(plainText(row[0] ?? []).trim())) });
    } else out.push(block);
  }
  return out;
}

export function RfcPage() {
  const blocks = useMemo(() => forPublic(parseMarkdown(source)), []);
  const sections = useMemo(
    () => blocks.flatMap((block: Block): Section[] => (block.type === "heading" && block.level === 2 ? [{ id: block.id, title: plainText(block.children) }] : [])),
    [blocks],
  );
  const ids = useMemo(() => sections.map((section) => section.id), [sections]);
  const { activeId, selectSection } = useTableOfContentsActiveId({ ids, offset: 96 });

  // The page renders after the browser's own jump to #anchor, so do it once the headings exist.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <main className="flex">
      <article className="min-w-0 flex-1 px-4 pt-12 pb-24 sm:px-8 sm:pt-16 lg:px-12">
        <div className="mx-auto max-w-3xl">
        <Markdown blocks={blocks} resolveHref={resolveHref} />
        </div>
      </article>
      <aside className="hidden w-64 shrink-0 border-l border-kumo-line xl:block">
        <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto px-6 py-12">
          <TableOfContents>
            <TableOfContents.Title>On this page</TableOfContents.Title>
            <TableOfContents.List>
              {sections.map((section) => (
                <TableOfContents.Item
                  key={section.id}
                  href={`#${section.id}`}
                  active={activeId === section.id}
                  onClick={() => selectSection(section.id)}
                  className="whitespace-normal"
                >
                  {section.title}
                </TableOfContents.Item>
              ))}
            </TableOfContents.List>
          </TableOfContents>
        </div>
      </aside>
    </main>
  );
}
