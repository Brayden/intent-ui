import { CATALOG, type CatalogSpec } from "../../../../shared/catalog";
import { ActionMenu } from "../composites/ActionMenu/ActionMenu";
import { BlockSources, BlockUpdated } from "../composites/BlockChrome/BlockChrome";
import { BoundCheckbox } from "../composites/Checkbox/BoundCheckbox";
import { BoundTextInput } from "../composites/TextInput/BoundTextInput";
import { PopoverComposite } from "../composites/Popover/PopoverComposite";
import { Stack } from "../composites/Stack/Stack";
import { DataTable } from "../composites/DataTable/DataTable";
import { DialogComposite } from "../composites/Dialog/DialogComposite";
import { KeyValueList } from "../composites/KeyValueList/KeyValueList";
import { RecordForm } from "../composites/RecordForm/RecordForm";
import { Stat } from "../composites/Stat/Stat";
import { KumoBadge } from "../kumo/KumoBadge";
import { KumoButton } from "../kumo/KumoButton";
import { KumoText } from "../kumo/KumoText";
import { component, type CatalogComponent } from "./types";

/** Renders nothing: these nodes are rendered by their parent (see each spec's `parent`). */
const RenderedByParent: CatalogComponent = () => null;

const COMPONENTS: Record<string, CatalogComponent> = {
  Text: component(KumoText),
  Badge: component(KumoBadge),
  Button: component(KumoButton),
  DataTable: component(DataTable),
  DataColumn: RenderedByParent,
  Stat: component(Stat),
  ActionMenu: component(ActionMenu),
  MenuItem: RenderedByParent,
  Dialog: component(DialogComposite),
  RecordForm: component(RecordForm),
  KeyValueList: component(KeyValueList),
  Stack: component(Stack),
  Checkbox: component(BoundCheckbox),
  TextInput: component(BoundTextInput),
  Popover: component(PopoverComposite),
  BlockUpdated: component(BlockUpdated),
  BlockSources: component(BlockSources),
};

export type CatalogEntry = { spec: CatalogSpec; component: CatalogComponent | undefined };

/** Shared catalog specs joined with their React implementations, keyed by type. */
export const catalog: Record<string, CatalogEntry> = Object.fromEntries(
  Object.values(CATALOG).map((spec) => [spec.type, { spec, component: COMPONENTS[spec.type] }]),
);

export type { CatalogComponent, CatalogComponentProps } from "./types";
