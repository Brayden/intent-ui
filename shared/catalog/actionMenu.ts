import { z } from "zod";
import type { CatalogSpec } from "./types";

export const ActionMenuPropsSchema = z.object({
  /** Accessible label for the trigger, e.g. "Member actions". */
  label: z.string(),
});
export type ActionMenuProps = z.infer<typeof ActionMenuPropsSchema>;

export const MenuItemPropsSchema = z.object({
  label: z.string(),
  variant: z.enum(["default", "danger"]).default("default"),
});
export type MenuItemProps = z.infer<typeof MenuItemPropsSchema>;

export const actionMenuSpec: CatalogSpec = {
  type: "ActionMenu",
  description: "A '⋯' menu button. Children must be MenuItem nodes, each with an action (often a deferred `intent`).",
  props: ActionMenuPropsSchema,
  children: { only: "MenuItem" },
};

export const menuItemSpec: CatalogSpec = {
  type: "MenuItem",
  description: "An item in an ActionMenu, or the secondary action in a DialogAction's split-button menu. Set `action`; use variant `danger` for destructive actions.",
  action: "fired when the item is chosen; `$item` is the row/item the menu is in.",
  props: MenuItemPropsSchema,
  parent: ["ActionMenu", "DialogAction"],
};
