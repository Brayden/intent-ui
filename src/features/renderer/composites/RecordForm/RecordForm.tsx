import { Button } from "@cloudflare/kumo/components/button";
import { Text } from "@cloudflare/kumo/components/text";
import { useEffect, useState, type FormEvent } from "react";
import type { RecordFormProps } from "../../../../../shared/catalog";
import type { CatalogComponentProps } from "../../catalog/types";
import { useBlock, useDispatch } from "../../context";
import { useDialogFooter } from "../Dialog/dialogFooter";
import { FormFieldInput } from "./FormFieldInput";
import { initialValues, toActionParams, type FormValues } from "./formValues";

/**
 * A form that submits its values as params of the node's action (usually a `tool` call). Inside
 * a Dialog its buttons move to the dialog's footer: Save there (`<button form>`), Cancel is the
 * dialog's dismiss button, and a successful submit closes the dialog.
 */
export function RecordForm({ nodeId, node, props, scope }: CatalogComponentProps<RecordFormProps>) {
  const { block } = useBlock();
  const dispatch = useDispatch();
  const [values, setValues] = useState<FormValues>(() => initialValues(props.fields));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = { blockId: block.id, nodeId, scope };
  const dialog = useDialogFooter();
  const inFooter = dialog?.formNodeId === nodeId;
  const setFooter = dialog?.setForm;

  useEffect(() => {
    if (!inFooter || !setFooter) return;
    setFooter({ label: props.submitLabel, pending, disabled: !node.action });
    return () => setFooter(null);
  }, [inFooter, setFooter, props.submitLabel, pending, node.action]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!node.action) return;
    setPending(true);
    setError(null);
    try {
      const params = { ...node.action.params, ...toActionParams(props.fields, values) };
      await dispatch({ ...node.action, params }, origin);
      if (inFooter && node.action.name === "tool") dialog?.close();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Something went wrong";
      if (message !== "Cancelled") setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form id={inFooter ? dialog?.formDomId : undefined} className="flex flex-col gap-4" onSubmit={submit}>
      {props.fields.map((field) => (
        <FormFieldInput
          key={field.name}
          field={field}
          value={values[field.name] ?? ""}
          onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
        />
      ))}
      {error && <Text variant="error">{error}</Text>}
      {!inFooter && (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => void dispatch({ name: "close" }, origin)}>
            {props.cancelLabel}
          </Button>
          <Button type="submit" variant="primary" loading={pending} disabled={!node.action}>
            {props.submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
