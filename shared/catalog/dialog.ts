import { z } from "zod";
import type { CatalogSpec } from "./types";

export const DialogPropsSchema = z.object({
  title: z.unknown().optional(),
  description: z.unknown().optional(),
  size: z.enum(["sm", "base", "lg", "xl"]).default("base"),
  /**
   * Label of the dismiss button, bottom left, shown when the dialog has actions: the dialog's only
   * cancel-type action ("Cancel", "Not now"). Defaults to "Cancel".
   */
  dismissLabel: z.string().optional(),
});
export type DialogProps = z.infer<typeof DialogPropsSchema>;

export const dialogSpec: CatalogSpec = {
  type: "Dialog",
  description:
    "A modal (rendered as a Kumo LayerDialog; a bottom sheet on mobile). The only modal type: use it as the root of every overlay template. It has its own title, description, and close button; children are its body, top to bottom. Closing it fires `close` automatically. In a page block, show it with `visible: { \"path\": \"/ui/…\" }` (or `/route/<param>` to make it linkable) and open it with a `set` action on that path (e.g. a DataTable row action setting `/ui/openTrack` to `$item`); closing then clears the path.\n" +
    "Actions go in the dialog's footer, never as Buttons in the body (at most 3): cancel-type on the left is the built-in dismiss button (set `dismissLabel`, e.g. \"Cancel\"; never add your own Cancel/Close button); the primary action on the right is one DialogAction child (e.g. Save, Delete); a second action goes inside that DialogAction as a MenuItem (its split-button menu, e.g. \"Save as draft\"). A RecordForm in a Dialog puts its submit button in the footer automatically, so it needs no DialogAction. Dialogs that only show information need no actions.",
  props: DialogPropsSchema,
  children: "any",
  childLimits: { DialogAction: 1 },
  overlay: true,
};

export const DialogActionPropsSchema = z.object({
  label: z.string(),
  /** `destructive` for deleting or other irreversible actions. */
  variant: z.enum(["primary", "destructive"]).default("primary"),
});
export type DialogActionProps = z.infer<typeof DialogActionPropsSchema>;

export const dialogActionSpec: CatalogSpec = {
  type: "DialogAction",
  description:
    "The dialog's primary action, rendered in its footer on the right (Kumo LayerDialog.Action). At most one per Dialog. Optionally one MenuItem child: a secondary action in its split-button menu.",
  action: "fired on click (e.g. a `tool` call, then the dialog closes on success; or `set`/`navigate`).",
  props: DialogActionPropsSchema,
  parent: "Dialog",
  children: { only: "MenuItem" },
  childLimits: { MenuItem: 1 },
};
