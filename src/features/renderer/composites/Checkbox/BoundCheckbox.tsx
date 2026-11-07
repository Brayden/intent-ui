import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import type { CheckboxProps } from "../../../../../shared/catalog";
import { isTruthy } from "../../../../../shared/spec";
import type { CatalogComponentProps } from "../../catalog/types";
import { useBlock, useDispatch } from "../../context";
import { asList, toggleMember } from "../../lib/listState";
import { resolvePath } from "../../lib/resolve";

/**
 * A Kumo checkbox bound to UI state at `bind`: a boolean flag, or (with `value`) membership of
 * that value in a list. Writes go through `set` actions.
 */
export function BoundCheckbox({ nodeId, props, scope }: CatalogComponentProps<CheckboxProps>) {
  const { block } = useBlock();
  const dispatch = useDispatch();
  const current = resolvePath(props.bind, scope);
  const isMembership = props.value !== undefined;
  const raw = isMembership ? asList(current).includes(props.value) : isTruthy(current);
  const checked = props.invert ? !raw : raw;

  const onCheckedChange = (next: boolean) => {
    const on = props.invert ? !next : next;
    const value = isMembership ? toggleMember(asList(current), props.value, on) : on;
    void dispatch({ name: "set", params: { path: props.bind, value } }, { blockId: block.id, nodeId, scope });
  };

  return <Checkbox label={props.label} checked={checked} onCheckedChange={onCheckedChange} />;
}
