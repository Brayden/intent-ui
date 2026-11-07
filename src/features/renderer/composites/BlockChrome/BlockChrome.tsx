import type { BlockMeta } from "../../../../../shared/spec";
import type { BlockSourcesProps, BlockUpdatedProps } from "../../../../../shared/catalog";
import type { CatalogComponentProps } from "../../catalog/types";
import { SourceBadges } from "../../components/chrome/SourceBadges";
import { UpdatedLabel } from "../../components/chrome/UpdatedLabel";
import { resolvePath } from "../../lib/resolve";

const metaOf = (scope: CatalogComponentProps<unknown>["scope"]) =>
  (resolvePath("/meta", scope) as BlockMeta | undefined) ?? { title: null, sources: [], updatedAt: null, loading: false, web: [] };

/** The block's freshness label, placeable anywhere in its tree. */
export function BlockUpdated({ props, scope }: CatalogComponentProps<BlockUpdatedProps>) {
  const meta = metaOf(scope);
  return <UpdatedLabel updatedAt={meta.updatedAt} loading={meta.loading} prefix={props.prefix} size={props.size} />;
}

/** The block's data-source badges, placeable anywhere in its tree. */
export function BlockSources({ scope }: CatalogComponentProps<BlockSourcesProps>) {
  const meta = metaOf(scope);
  return <SourceBadges sources={meta.sources} web={meta.web} />;
}
