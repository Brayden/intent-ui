import { Link, Table } from "@cloudflare/kumo";
import { CodeHighlighted, normalizeLanguage, ShikiProvider } from "@cloudflare/kumo/code";
import type { ReactNode } from "react";
import type { Block, Inline } from "./parse";

/** Languages loaded for highlighting; other fences render as plain code. */
const LANGUAGES = ["jsonc", "json", "tsx", "typescript", "bash", "shell", "yaml", "diff", "html", "css"] as const;

type Props = {
  blocks: Block[];
  /** Maps a link target to where it should go (e.g. repo-relative paths to GitHub). */
  resolveHref?: (href: string) => string;
};

/** Renders parsed Markdown with Kumo components and tokens. */
export function Markdown({ blocks, resolveHref = (href) => href }: Props) {
  return (
    <ShikiProvider engine="javascript" languages={[...LANGUAGES]}>
      <div className="text-base leading-7 text-kumo-default">{renderBlocks(blocks, resolveHref)}</div>
    </ShikiProvider>
  );
}

function renderBlocks(blocks: Block[], resolveHref: (href: string) => string, tight = false): ReactNode {
  return blocks.map((block, index) => <BlockView key={index} block={block} resolveHref={resolveHref} tight={tight} />);
}

const HEADING_CLASSES: Record<number, string> = {
  1: "mt-0 mb-6 text-3xl font-semibold tracking-tight text-kumo-strong sm:text-4xl",
  2: "mt-14 mb-4 border-t border-kumo-hairline pt-10 text-2xl font-semibold tracking-tight text-kumo-strong",
  3: "mt-10 mb-3 text-lg font-semibold text-kumo-strong",
  4: "mt-8 mb-2 text-base font-semibold text-kumo-strong",
};

function BlockView({ block, resolveHref, tight }: { block: Block; resolveHref: (href: string) => string; tight: boolean }) {
  const inline = (nodes: Inline[]) => renderInline(nodes, resolveHref);

  switch (block.type) {
    case "heading": {
      const Tag = `h${Math.min(block.level, 6)}` as "h1";
      return (
        <Tag id={block.id} className={`group scroll-mt-24 ${HEADING_CLASSES[block.level] ?? HEADING_CLASSES[4]}`}>
          {inline(block.children)}
          {block.level > 1 && (
            <a href={`#${block.id}`} aria-label="Link to this section" className="ml-2 text-kumo-subtle no-underline opacity-0 transition-opacity group-hover:opacity-100">
              #
            </a>
          )}
        </Tag>
      );
    }

    case "paragraph":
      return <p className={tight ? "my-0 [&:not(:first-child)]:mt-2" : "my-4"}>{inline(block.children)}</p>;

    case "code": {
      const lang = normalizeLanguage(block.lang);
      if (lang && (LANGUAGES as readonly string[]).includes(lang)) {
        return <CodeHighlighted code={block.value} lang={lang} showCopyButton className="my-5 overflow-hidden" />;
      }
      return (
        <pre className="my-5 overflow-x-auto rounded-md border border-kumo-fill bg-kumo-base p-4 font-mono text-sm leading-relaxed text-kumo-default">
          <code>{block.value}</code>
        </pre>
      );
    }

    case "table":
      return (
        <div className="my-6 overflow-x-auto rounded-md border border-kumo-fill bg-kumo-base">
          <Table>
            {/* Key-value tables (like an RFC's header) have an empty header row; skip it. */}
            {block.head.some((cell) => cell.length > 0) && (
              <Table.Header>
                <Table.Row>
                  {block.head.map((cell, column) => (
                    <Table.Head key={column} style={{ textAlign: block.align[column] ?? undefined }}>
                      {inline(cell)}
                    </Table.Head>
                  ))}
                </Table.Row>
              </Table.Header>
            )}
            <Table.Body>
              {block.rows.map((row, rowIndex) => (
                <Table.Row key={rowIndex}>
                  {row.map((cell, column) => (
                    <Table.Cell key={column} className="align-top text-sm leading-6" style={{ textAlign: block.align[column] ?? undefined }}>
                      {inline(cell)}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      );

    case "list": {
      const items = block.items.map((item, index) => (
        <li key={index} className="pl-1 [&>ol]:my-1 [&>ul]:my-1">
          {renderBlocks(item, resolveHref, true)}
        </li>
      ));
      return block.ordered ? (
        <ol start={block.start} className={`${tight ? "my-1" : "my-4"} list-decimal space-y-1.5 pl-6 marker:text-kumo-subtle`}>
          {items}
        </ol>
      ) : (
        <ul className={`${tight ? "my-1" : "my-4"} list-disc space-y-1.5 pl-6 marker:text-kumo-subtle`}>{items}</ul>
      );
    }

    case "quote":
      return <blockquote className="my-5 border-l-2 border-kumo-line pl-4 text-kumo-subtle">{renderBlocks(block.children, resolveHref)}</blockquote>;

    case "rule":
      return <hr className="my-10 border-kumo-hairline" />;
  }
}

function renderInline(nodes: Inline[], resolveHref: (href: string) => string): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return node.value;
      case "code":
        return (
          <code key={index} className="rounded border border-kumo-hairline bg-kumo-base px-1 py-0.5 font-mono text-[0.85em]">
            {node.value}
          </code>
        );
      case "strong":
        return (
          <strong key={index} className="font-semibold text-kumo-strong">
            {renderInline(node.children, resolveHref)}
          </strong>
        );
      case "em":
        return <em key={index}>{renderInline(node.children, resolveHref)}</em>;
      case "link": {
        const href = resolveHref(node.href);
        const external = /^https?:\/\//.test(href);
        return (
          <Link key={index} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {renderInline(node.children, resolveHref)}
          </Link>
        );
      }
    }
  });
}
