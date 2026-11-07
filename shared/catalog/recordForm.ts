import { z } from "zod";
import { DynamicValueSchema } from "../spec/values";
import type { CatalogSpec } from "./types";

export const FormFieldSchema = z.object({
  /** The argument name this field fills in the submit action (e.g. a tool input property). */
  name: z.string(),
  label: z.string(),
  type: z.enum(["text", "email", "number", "textarea"]).default("text"),
  /** Initial value, usually `{ "path": "$item/..." }`. */
  value: DynamicValueSchema.optional(),
  required: z.boolean().default(false),
  description: z.string().optional(),
});
export type FormField = z.infer<typeof FormFieldSchema>;

export const RecordFormPropsSchema = z.object({
  fields: z.array(FormFieldSchema).min(1),
  submitLabel: z.string().default("Save"),
  cancelLabel: z.string().default("Cancel"),
});
export type RecordFormProps = z.infer<typeof RecordFormPropsSchema>;

export const recordFormSpec: CatalogSpec = {
  type: "RecordForm",
  description:
    "A form with Save/Cancel. On submit, fires the node's `action` with its params plus each field's value under the field `name` (usually a `tool` action whose args match the fields). Cancel fires `close`. Inside a Dialog, its submit button moves to the dialog's footer (primary, right) and Cancel is the dialog's dismiss button.",
  action: "fired on submit, with the field values added to its params.",
  props: RecordFormPropsSchema,
};
