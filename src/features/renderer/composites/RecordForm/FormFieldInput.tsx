import { Input, InputArea } from "@cloudflare/kumo/components/input";
import type { FormField } from "../../../../../shared/catalog";

type FormFieldInputProps = { field: FormField; value: string; onChange: (value: string) => void };

/** One RecordForm field, rendered with the matching Kumo input. */
export function FormFieldInput({ field, value, onChange }: FormFieldInputProps) {
  if (field.type === "textarea") {
    return (
      <InputArea
        label={field.label}
        description={field.description}
        value={value}
        required={field.required}
        onValueChange={onChange}
      />
    );
  }
  return (
    <Input
      label={field.label}
      description={field.description}
      type={field.type}
      value={value}
      required={field.required}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
