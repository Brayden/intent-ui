import type { Template } from "../../../../shared/api";
import type { Block } from "../../../../shared/spec";

/** Wraps a materialized template as a block that reads its parent's view model. */
export function overlayBlock(template: Template, parent: Block): Block {
  return {
    ...parent,
    id: `${parent.id}::${template.id}`,
    slot: "overlay",
    order: 0,
    frame: { style: "plain", title: false, sources: false, freshness: false },
    title: undefined,
    toolbar: undefined,
    ui: {},
    root: template.root,
    nodes: template.nodes,
  };
}
