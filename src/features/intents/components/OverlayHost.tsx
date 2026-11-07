import { blockMeta, type Workspace } from "../../../../shared/spec";
import { BlockContent } from "../../renderer";
import type { Overlay } from "../hooks/useIntentRuntime";

/** Renders the open overlay (a materialized intent) on top of the page. */
export function OverlayHost({ overlay, workspace }: { overlay: Overlay | null; workspace: Workspace }) {
  if (!overlay) return null;
  // Overlays read their parent block's data, so their meta is the parent's.
  const meta = blockMeta(overlay.parent, overlay.view, workspace);
  return <BlockContent key={overlay.block.id} block={overlay.block} view={overlay.view} meta={meta} item={overlay.item} />;
}
