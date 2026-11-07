import { Button } from "@cloudflare/kumo/components/button";
import type { ButtonProps } from "../../../../shared/catalog";
import type { CatalogComponentProps } from "../catalog/types";
import { useBlock, useDispatch } from "../context";

/** Kumo `Button` exposed to the catalog; clicking dispatches the node's action. */
export function KumoButton({ nodeId, node, props, scope }: CatalogComponentProps<ButtonProps>) {
  const { block } = useBlock();
  const dispatch = useDispatch();
  const { action } = node;
  return (
    <Button
      variant={props.variant}
      size={props.size}
      disabled={!action}
      onClick={() => action && void dispatch(action, { blockId: block.id, nodeId, scope })}
    >
      {props.label}
    </Button>
  );
}
