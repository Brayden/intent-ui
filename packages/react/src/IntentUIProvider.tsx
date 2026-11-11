import { Toasty } from "@cloudflare/kumo/components/toast";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { HostPatch, HostPatchesResponse } from "../../../shared/api";
import { api, setApiBase } from "../../../src/lib/api";
import { CommandShortcutProvider, OPEN_COMMAND_MENU_EVENT, type ShortcutSetting } from "../../../src/features/command";
import { ComponentBindingsProvider, type CatalogComponent } from "../../../src/features/renderer";
import { ConfirmProvider } from "../../../src/lib/confirm";
import type { ComponentBindings } from "./bindings";
import { useToasts } from "../../../src/lib/useToasts";
import { IntentUIContextInternal, type IntentUIContextValue } from "./context";
import { HostEditing } from "./HostEditing";
import { IntentUISettings } from "./IntentUISettings";
import { useMutationsSwitch } from "./mutations";
import { EMPTY_STATUS, PatchLayer, type Patch, type PatchStatus } from "./patches";

type IntentUIProviderProps = {
  children: ReactNode;
  /** Where the host mounted the Intent UI server handler. Defaults to "/api". */
  endpoint?: string;
  /** Whether customizations show before the user chooses. Defaults to true. */
  defaultEnabled?: boolean;
  /** Extra customizations supplied by the host (in addition to the user's saved ones). */
  patches?: Patch[];
  /**
   * Your components for catalog types, so generated UI looks like the rest of your product. Types
   * left out use the built-in Kumo implementations. See `defineBindings` and BINDINGS.md.
   */
  components?: ComponentBindings;
  /**
   * The shortcut that opens the command menu on generated pages: "mod+k" (default; ⌘K / Ctrl+K),
   * any combination like "mod+shift+k" or "alt+i", or false to rely on `openCommandMenu()`.
   */
  shortcut?: ShortcutSetting;
};

const NO_PATCHES: Patch[] = [];
const CSS_ID = "intent-ui-host-css";

function setCss(css: string): void {
  const style = document.getElementById(CSS_ID) ?? Object.assign(document.createElement("style"), { id: CSS_ID });
  if (!style.isConnected) document.head.append(style);
  style.textContent = css;
}

/**
 * Wrap the host app (or the part that uses Intent UI) once. Provides the master switch, loads and
 * applies the user's customizations of the host's pages, enables right-click to make new ones,
 * and hosts the settings dialog.
 */
const NO_BINDINGS: ComponentBindings = {};

export function IntentUIProvider({ components = NO_BINDINGS, shortcut = "mod+k", ...props }: IntentUIProviderProps) {
  // Toasts need Kumo's Toasty above anything that calls useToasts().
  return (
    <Toasty>
      <ConfirmProvider>
        <CommandShortcutProvider shortcut={shortcut}>
          <ComponentBindingsProvider bindings={components as Partial<Record<string, CatalogComponent>>}>
            <Provider {...props} />
          </ComponentBindingsProvider>
        </CommandShortcutProvider>
      </ConfirmProvider>
    </Toasty>
  );
}

function Provider({ children, endpoint = "/api", defaultEnabled = true, patches: hostPatches = NO_PATCHES }: IntentUIProviderProps) {
  // Module-level so every API call in the generated UI uses it; set before children render.
  useMemo(() => setApiBase(endpoint), [endpoint]);
  const toasts = useToasts();
  const { enabled, setEnabled } = useMutationsSwitch(defaultEnabled);
  const [saved, setSaved] = useState<HostPatch[]>([]);
  const [status, setStatus] = useState<PatchStatus>(EMPTY_STATUS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    api<HostPatchesResponse>("GET", "/api/host/patches")
      .then((result) => {
        setCss(result.css);
        setSaved(result.patches);
      })
      .catch(() => undefined); // No server customizations: host-supplied ones still apply.
  }, [endpoint]);

  const persist = useCallback(
    (next: HostPatch[]) => {
      setSaved(next);
      api<HostPatchesResponse>("PUT", "/api/host/patches", { patches: next })
        .then((result) => setCss(result.css))
        .catch((error: Error) => toasts.add({ title: "Couldn't save your customization", description: error.message, variant: "error" }));
    },
    [toasts],
  );

  const savePatch = useCallback(
    (patch: HostPatch, css: string) => {
      if (css) setCss(`${document.getElementById(CSS_ID)?.textContent ?? ""}\n${css}`);
      persist([...saved.filter((p) => p.id !== patch.id), patch]);
    },
    [saved, persist],
  );
  const removePatch = useCallback((id: string) => persist(saved.filter((p) => p.id !== id)), [saved, persist]);

  const all = useMemo(() => [...hostPatches, ...saved], [hostPatches, saved]);

  const value = useMemo<IntentUIContextValue>(
    () => ({
      endpoint,
      mutationsEnabled: enabled,
      setMutationsEnabled: setEnabled,
      openSettings: () => setSettingsOpen(true),
      openCommandMenu: () => window.dispatchEvent(new Event(OPEN_COMMAND_MENU_EVENT)),
      patchStatus: status,
      patches: all,
      removePatch,
    }),
    [endpoint, enabled, setEnabled, status, all, removePatch],
  );

  return (
    <IntentUIContextInternal.Provider value={value}>
      {children}
      <PatchLayer patches={all} enabled={enabled} onStatus={setStatus} />
      <HostEditing enabled={enabled} patches={saved} onPatch={savePatch} onRemove={removePatch} />
      <IntentUISettings open={settingsOpen} onOpenChange={setSettingsOpen} />
    </IntentUIContextInternal.Provider>
  );
}
