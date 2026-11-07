import { createContext, useContext } from "react";

/** What a form in a dialog shows on the footer's submit button. */
export type FormSubmitState = { label: string; pending: boolean; disabled: boolean };

/**
 * Lets the dialog's first RecordForm hand its buttons to the dialog footer (Kumo
 * LayerDialog.Actions): Save on the right, Cancel = the dialog's dismiss button.
 */
export type DialogFooter = {
  /** The RecordForm node whose submit lives in the footer (null when a DialogAction does). */
  formNodeId: string | null;
  /** The DOM id the footer's submit button targets (`<button form=…>`). */
  formDomId: string;
  setForm: (state: FormSubmitState | null) => void;
  /** Closes the dialog (after a successful submit). */
  close: () => void;
};

export const DialogFooterContext = createContext<DialogFooter | null>(null);

export const useDialogFooter = () => useContext(DialogFooterContext);
