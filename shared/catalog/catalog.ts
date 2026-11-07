import { actionMenuSpec, menuItemSpec } from "./actionMenu";
import { dataColumnSpec, dataTableSpec } from "./dataTable";
import { dialogActionSpec, dialogSpec } from "./dialog";
import { keyValueListSpec } from "./keyValueList";
import { blockSourcesSpec, blockUpdatedSpec } from "./blockChrome";
import { checkboxSpec, popoverSpec, stackSpec, textInputSpec } from "./layout";
import { badgeSpec, buttonSpec, textSpec } from "./primitives";
import { recordFormSpec } from "./recordForm";
import { statSpec } from "./stat";
import type { CatalogSpec } from "./types";

const specs: CatalogSpec[] = [
  textSpec, badgeSpec, buttonSpec,
  dataTableSpec, dataColumnSpec, statSpec,
  actionMenuSpec, menuItemSpec,
  dialogSpec, dialogActionSpec, recordFormSpec, keyValueListSpec,
  stackSpec, checkboxSpec, popoverSpec, textInputSpec,
  blockUpdatedSpec, blockSourcesSpec,
];

/** Every component type a spec may use, keyed by type. Shared by validator, prompt, renderer. */
export const CATALOG: Record<string, CatalogSpec> = Object.fromEntries(specs.map((spec) => [spec.type, spec]));
