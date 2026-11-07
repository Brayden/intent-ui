import { z } from "zod";
import { VALUE_FORMATS } from "./formats";
import type { CatalogSpec } from "./types";

export const StatPropsSchema = z.object({
  label: z.string(),
  /** Usually bound with a path. Null renders as unknown, never zero. */
  value: z.unknown().optional(),
  format: z.enum(VALUE_FORMATS).default("number"),
  /** Plain-language definition shown under the value. */
  hint: z.string().optional(),
  requires: z.array(z.string()).default([]),
});
export type StatProps = z.infer<typeof StatPropsSchema>;

export const statSpec: CatalogSpec = {
  type: "Stat",
  description: "A labelled headline number. Bind `value` with a path; add a `hint` explaining exactly what it counts.",
  props: StatPropsSchema,
};
