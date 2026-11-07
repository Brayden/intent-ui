import type { SaveStatus } from "../hooks/useAutosave";

/** Autosave status, as shown in the command menu footer (errors also toast). */
export const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "All changes saved",
  pending: "Unsaved changes…",
  saving: "Saving…",
  error: "Couldn't save",
  conflict: "Changed elsewhere: reload",
};
