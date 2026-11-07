import { Button } from "@cloudflare/kumo/components/button";
import { Popover } from "@cloudflare/kumo/components/popover";
import { Text } from "@cloudflare/kumo/components/text";
import type { PopoverProps } from "../../../../../shared/catalog";
import type { CatalogComponentProps } from "../../catalog/types";

/** A button that opens a small panel with the node's children. */
export function PopoverComposite({ node, props, scope, renderNode }: CatalogComponentProps<PopoverProps>) {
  return (
    <Popover.Root>
      <Popover.Trigger render={<Button variant={props.variant} size="sm" />}>{props.label}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner>
          <Popover.Popup className="flex w-64 flex-col gap-3 p-3">
            {props.title && <Text variant="heading3" as="h3">{props.title}</Text>}
            {node.children?.map((id) => renderNode(id, scope))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
