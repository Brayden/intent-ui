import type { ActionMenuProps, MenuItemProps } from "./actionMenu";
import type { BlockSourcesProps, BlockUpdatedProps } from "./blockChrome";
import type { DataColumnProps, DataTableProps } from "./dataTable";
import type { DialogActionProps, DialogProps } from "./dialog";
import type { KeyValueListProps } from "./keyValueList";
import type { CheckboxProps, PopoverProps, StackProps, TextInputProps } from "./layout";
import type { BadgeProps, ButtonProps, TextProps } from "./primitives";
import type { RecordFormProps } from "./recordForm";
import type { StatProps } from "./stat";

/**
 * Every catalog type and the props its implementation receives (after bindings are resolved and
 * defaults applied). This is the contract a host's component bindings implement.
 */
export type CatalogProps = {
  Text: TextProps;
  Badge: BadgeProps;
  Button: ButtonProps;
  Stat: StatProps;
  Stack: StackProps;
  DataTable: DataTableProps;
  DataColumn: DataColumnProps;
  KeyValueList: KeyValueListProps;
  Dialog: DialogProps;
  DialogAction: DialogActionProps;
  RecordForm: RecordFormProps;
  ActionMenu: ActionMenuProps;
  MenuItem: MenuItemProps;
  Checkbox: CheckboxProps;
  TextInput: TextInputProps;
  Popover: PopoverProps;
  BlockUpdated: BlockUpdatedProps;
  BlockSources: BlockSourcesProps;
};

export type CatalogType = keyof CatalogProps;
