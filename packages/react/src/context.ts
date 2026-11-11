import { createContext, useContext } from "react";
import type { HostPatch } from "../../../shared/api";
import type { PatchStatus } from "./patches";

export type IntentUIContextValue = {
  /** Where the server handler is mounted, e.g. "/api". */
  endpoint: string;
  /** The master switch: false shows the host's default UI with nothing from Intent UI. */
  mutationsEnabled: boolean;
  setMutationsEnabled: (enabled: boolean) => void;
  /** Opens the settings dialog (data sources, customizations), wherever the host calls it from. */
  openSettings: () => void;
  /** Opens the command menu on the current generated page (for when the shortcut is off or hidden). */
  openCommandMenu: () => void;
  /** How the current page's patches applied. */
  patchStatus: PatchStatus;
  /** Every saved customization of the host's pages. */
  patches: HostPatch[];
  /** Removes one customization (saved immediately). */
  removePatch: (id: string) => void;
};

export const IntentUIContextInternal = createContext<IntentUIContextValue | null>(null);

/** Intent UI's state and actions, for host UI (a toggle in a menu, a settings button). */
export function useIntentUI(): IntentUIContextValue {
  const value = useContext(IntentUIContextInternal);
  if (!value) throw new Error("useIntentUI must be used inside <IntentUIProvider>");
  return value;
}
