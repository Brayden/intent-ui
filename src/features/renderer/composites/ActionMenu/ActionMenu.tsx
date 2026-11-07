import { Button } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { isHtmlNode } from "../../../../../shared/spec";
import type { CatalogComponentProps } from "../../catalog/types";
import { useBlock, useDispatch } from "../../context";
import { MenuItemPropsSchema, type ActionMenuProps } from "../../../../../shared/catalog";

/** The "⋯" menu: a flattened Kumo DropdownMenu whose MenuItem children carry actions. */
export function ActionMenu({ node, props, scope }: CatalogComponentProps<ActionMenuProps>) {
  const { block } = useBlock();
  const dispatch = useDispatch();

  const items = (node.children ?? []).flatMap((id) => {
    const child = block.nodes[id];
    if (isHtmlNode(child) || child?.type !== "MenuItem") return [];
    const parsed = MenuItemPropsSchema.safeParse(child.props);
    return parsed.success ? [{ id, props: parsed.data, action: child.action }] : [];
  });

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button aria-label={props.label} icon={<DotsThreeIcon size={16} />} shape="square" size="sm" variant="ghost" />
        }
      />
      <DropdownMenu.Content>
        {items.map((item) => (
          <DropdownMenu.Item
            key={item.id}
            variant={item.props.variant}
            disabled={!item.action}
            onClick={() => item.action && void dispatch(item.action, { blockId: block.id, nodeId: item.id, scope })}
          >
            {item.props.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
