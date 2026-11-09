import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { LayerDialog } from "@cloudflare/kumo/components/layer-dialog";
import { Text } from "@cloudflare/kumo/components/text";
import { useMemo, useState } from "react";
import { DialogActionPropsSchema, MenuItemPropsSchema, type DialogProps } from "../../../../../shared/catalog";
import { closingWrites, conditionPaths, isHtmlNode, isVisible, type Block } from "../../../../../shared/spec";
import type { CatalogComponentProps } from "../../catalog/types";
import { useBlock, useDispatch } from "../../context";
import { formatValue } from "../../lib/format";
import { resolvePath, type Scope } from "../../lib/resolve";
import { DialogFooterContext, type FormSubmitState } from "./dialogFooter";

/** The first RecordForm under `ids` (depth-first), whose submit button moves to the footer. */
function firstForm(block: Block, ids: string[] = []): string | null {
  for (const id of ids) {
    const node = block.nodes[id];
    if (!node) continue;
    if (!isHtmlNode(node) && node.type === "RecordForm") return id;
    const nested = firstForm(block, node.children);
    if (nested) return nested;
  }
  return null;
}

function isDialogAction(block: Block, id: string): boolean {
  const node = block.nodes[id];
  return node !== undefined && !isHtmlNode(node) && node.type === "DialogAction";
}

/** The dialog's DialogAction child (if visible) and its optional secondary MenuItem. */
function dialogAction(block: Block, ids: string[] = [], scope: Scope) {
  const id = ids.find((child) => {
    const node = block.nodes[child];
    return isDialogAction(block, child) && isVisible(node?.visible, (path) => resolvePath(path, scope));
  });
  const node = id ? block.nodes[id] : undefined;
  if (!id || !node || isHtmlNode(node)) return null;
  const props = DialogActionPropsSchema.safeParse(node.props);
  if (!props.success) return null;
  const menu = (node.children ?? []).flatMap((childId) => {
    const child = block.nodes[childId];
    if (!child || isHtmlNode(child) || child.type !== "MenuItem") return [];
    const parsed = MenuItemPropsSchema.safeParse(child.props);
    return parsed.success ? [{ id: childId, props: parsed.data, action: child.action }] : [];
  });
  return { id, props: props.data, action: node.action, menu };
}

/**
 * A modal, rendered with Kumo `LayerDialog` (our rule for all modals; a bottom sheet on mobile).
 *
 * Footer (Kumo LayerDialog.Actions, at most 3 actions): the dismiss button on the left is the only
 * cancel-type action (`dismissLabel`); the primary action on the right is the DialogAction child,
 * or else the first RecordForm's submit; a secondary action sits in its split-button menu.
 *
 * Dismissing it (X, Esc, backdrop, the dismiss button) always closes it:
 * - an overlay root (a materialized intent) fires `close`;
 * - a dialog in a page block clears the state its `visible` condition reads, whether UI state
 *   (`/ui/...`) or the page URL (`/route/...`, a deep-linkable dialog), incl. `eq`/`and`/`or`;
 * - otherwise it hides itself until the state its condition reads changes (e.g. its button is
 *   clicked again).
 */
export function DialogComposite({ nodeId, node, props, scope, renderNode }: CatalogComponentProps<DialogProps>) {
  const { block } = useBlock();
  const dispatch = useDispatch();
  // The values its condition reads when it was dismissed locally; it shows again once they change.
  const stateKey = JSON.stringify(conditionPaths(node.visible).map((path) => resolvePath(path, scope)));
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const [form, setForm] = useState<FormSubmitState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin = { blockId: block.id, nodeId, scope };
  const close = () => {
    const writes = closingWrites(node.visible, (path) => resolvePath(path, scope));
    if (writes) {
      for (const path of writes) void dispatch({ name: "set", params: { path, value: null } }, origin);
      return;
    }
    void dispatch({ name: "close" }, origin); // an overlay root (no-op for a page block's dialog)
    setDismissedAt(stateKey);
  };

  const action = dialogAction(block, node.children, scope);
  const formNodeId = action ? null : firstForm(block, node.children);
  const formDomId = `dialog-form-${block.id}-${nodeId}`;
  const footer = useMemo(() => ({ formNodeId, formDomId, setForm, close }), [formNodeId, formDomId, stateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (dismissedAt === stateKey) return null;

  const runAction = async () => {
    if (!action?.action) return;
    setPending(true);
    setError(null);
    try {
      await dispatch(action.action, { ...origin, nodeId: action.id });
      // A successful tool call is done: close (page-block dialogs too; overlays already closed).
      if (action.action.name === "tool") close();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Something went wrong";
      if (message !== "Cancelled") setError(message);
    } finally {
      setPending(false);
    }
  };

  const primary = action ? (
    <LayerDialog.Action
      variant={action.props.variant}
      loading={pending}
      disabled={!action.action}
      onClick={() => void runAction()}
      menu={action.menu.map((item) => (
        <DropdownMenu.Item
          key={item.id}
          variant={item.props.variant}
          disabled={!item.action}
          onClick={() => item.action && void dispatch(item.action, { ...origin, nodeId: item.id })}
        >
          {item.props.label}
        </DropdownMenu.Item>
      ))}
    >
      {action.props.label}
    </LayerDialog.Action>
  ) : form ? (
    <LayerDialog.Action type="submit" form={formDomId} loading={form.pending} disabled={form.disabled}>
      {form.label}
    </LayerDialog.Action>
  ) : null;

  return (
    <LayerDialog.Root open onOpenChange={(open) => !open && close()}>
      <LayerDialog.Content size={props.size}>
        <LayerDialog.Title>{formatValue(props.title)}</LayerDialog.Title>
        {props.description != null && <LayerDialog.Description>{formatValue(props.description)}</LayerDialog.Description>}
        <LayerDialog.Body>
          <DialogFooterContext.Provider value={footer}>
            <div className="flex flex-col gap-4">
              {/* DialogAction children render in the footer (below), never in the body. */}
              {node.children?.filter((id) => !isDialogAction(block, id)).map((id) => renderNode(id, scope))}
              {error && <Text variant="error">{error}</Text>}
            </div>
          </DialogFooterContext.Provider>
        </LayerDialog.Body>
        {primary && <LayerDialog.Actions dismissLabel={props.dismissLabel ?? "Cancel"}>{primary}</LayerDialog.Actions>}
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
