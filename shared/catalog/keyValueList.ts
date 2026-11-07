import { z } from "zod";
import { VALUE_FORMATS } from "./formats";
import type { CatalogSpec } from "./types";

export const KeyValueListPropsSchema = z.object({
  items: z
    .array(
      z.object({
        label: z.string(),
        value: z.unknown().optional(),
        format: z.enum(VALUE_FORMATS).default("text"),
      }),
    )
    .min(1),
});
export type KeyValueListProps = z.infer<typeof KeyValueListPropsSchema>;

export const keyValueListSpec: CatalogSpec = {
  type: "KeyValueList",
  description: "Label/value pairs for showing one record's details. Bind each `value` with a path (e.g. `$item/email`).",
  props: KeyValueListPropsSchema,
};
