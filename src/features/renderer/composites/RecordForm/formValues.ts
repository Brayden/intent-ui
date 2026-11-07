import type { FormField } from "../../../../../shared/catalog";

export type FormValues = Record<string, string>;

/** Initial input values from each field's (already resolved) `value`. */
export function initialValues(fields: FormField[]): FormValues {
  return Object.fromEntries(fields.map((field) => [field.name, field.value == null ? "" : String(field.value)]));
}

/** Converts input strings to the types the action expects (numbers for number fields). */
export function toActionParams(fields: FormField[], values: FormValues): Record<string, string | number | null> {
  return Object.fromEntries(
    fields.map((field) => {
      const raw = values[field.name] ?? "";
      if (field.type === "number") return [field.name, raw === "" ? null : Number(raw)];
      return [field.name, raw];
    }),
  );
}
