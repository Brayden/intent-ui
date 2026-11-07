import { Text } from "@cloudflare/kumo/components/text";
import type { ReactNode } from "react";
import type { Block, BlockMeta } from "../../../../shared/spec";
import { useFrameTargetHandler } from "../targeting";
import { SourceBadges } from "./chrome/SourceBadges";
import { UpdatedLabel } from "./chrome/UpdatedLabel";

type BlockFrameProps = {
  block: Block;
  meta: BlockMeta;
  /** Rendered block toolbar (header controls), if the block has one. */
  toolbar?: ReactNode;
  children: ReactNode;
};

/**
 * A block's chrome: card or plain, with optional title, toolbar, source badges, and freshness,
 * all controlled by the block's `frame` spec. Every part can be right-clicked to change it, and
 * the same parts exist as catalog components (BlockUpdated, BlockSources) to place elsewhere.
 */
export function BlockFrame({ block, meta, toolbar, children }: BlockFrameProps) {
  const { frame } = block;
  const onFrame = useFrameTargetHandler("frame");
  const onTitle = useFrameTargetHandler("title");
  const onSources = useFrameTargetHandler("sources");
  const onFreshness = useFrameTargetHandler("freshness");

  const title = frame.title && meta.title && (
    <span onContextMenu={onTitle}>
      <Text variant="heading3" as="h2">
        {meta.title}
      </Text>
    </span>
  );
  const sources = frame.sources && (meta.sources.length > 0 || meta.web.length > 0) && (
    <span onContextMenu={onSources}>
      <SourceBadges sources={meta.sources} web={meta.web} />
    </span>
  );
  const freshness = frame.freshness && (meta.updatedAt || meta.loading) && (
    <span onContextMenu={onFreshness}>
      <UpdatedLabel updatedAt={meta.updatedAt} loading={meta.loading} />
    </span>
  );
  const header = (title || toolbar || sources || freshness) && (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>{title}</div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {toolbar}
        {sources}
        {freshness}
      </div>
    </header>
  );

  const surface =
    frame.style === "card"
      ? "flex flex-col gap-3 rounded-lg border border-kumo-hairline bg-kumo-base p-4"
      : "flex flex-col gap-3";
  return (
    <section className={surface} onContextMenu={onFrame}>
      {header}
      {children}
    </section>
  );
}
