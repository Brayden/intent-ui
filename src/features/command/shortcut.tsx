import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

/*
 * The command menu's keyboard shortcut. "mod" is ⌘ on Apple platforms and Ctrl elsewhere. A host
 * embedding Intent UI picks one that doesn't clash with its own (e.g. "mod+shift+k", "mod+i"),
 * or false to turn it off and open the menu from its own UI.
 */
export type ShortcutSetting = string | false;

type Parsed = { key: string; mod: boolean; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean };

const isApple = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function parseShortcut(setting: ShortcutSetting): Parsed | null {
  if (setting === false) return null;
  const parts = setting.toLowerCase().split("+").map((part) => part.trim());
  const key = parts.pop();
  if (!key) return null;
  const has = (name: string) => parts.includes(name);
  return { key, mod: has("mod"), ctrl: has("ctrl"), meta: has("meta") || has("cmd"), shift: has("shift"), alt: has("alt") || has("option") };
}

/** "⌘⇧K" on Apple platforms, "Ctrl Shift K" elsewhere. */
export function shortcutLabel(parsed: Parsed | null): string | null {
  if (!parsed) return null;
  const apple = isApple();
  const key = parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key[0]!.toUpperCase() + parsed.key.slice(1);
  const mods = [
    (parsed.mod && apple) || parsed.meta ? (apple ? "⌘" : "Meta") : null,
    (parsed.mod && !apple) || parsed.ctrl ? (apple ? "⌃" : "Ctrl") : null,
    parsed.alt ? (apple ? "⌥" : "Alt") : null,
    parsed.shift ? (apple ? "⇧" : "Shift") : null,
  ].filter(Boolean);
  return apple ? `${mods.join("")}${key}` : [...mods, key].join(" ");
}

function matches(event: KeyboardEvent, parsed: Parsed): boolean {
  const apple = isApple();
  const wantMeta = parsed.meta || (parsed.mod && apple);
  const wantCtrl = parsed.ctrl || (parsed.mod && !apple);
  return (
    event.key.toLowerCase() === parsed.key &&
    event.metaKey === wantMeta &&
    event.ctrlKey === wantCtrl &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt
  );
}

const ShortcutContext = createContext<ShortcutSetting>("mod+k");

export function CommandShortcutProvider({ shortcut, children }: { shortcut: ShortcutSetting; children: ReactNode }) {
  return <ShortcutContext.Provider value={shortcut}>{children}</ShortcutContext.Provider>;
}

/** The configured shortcut, parsed, and its label (null when turned off). */
export function useShortcut(): { parsed: Parsed | null; label: string | null } {
  const setting = useContext(ShortcutContext);
  return useMemo(() => {
    const parsed = parseShortcut(setting);
    return { parsed, label: shortcutLabel(parsed) };
  }, [setting]);
}

/** Event a host dispatches (via the SDK's `openCommandMenu()`) to open the menu from its own UI. */
export const OPEN_COMMAND_MENU_EVENT = "intent-ui:open-command-menu";

/**
 * Calls `onToggle` when the configured shortcut is pressed, wherever focus is, and `onOpen` when
 * the host asks to open the menu (works with the shortcut turned off).
 */
export function useCommandShortcut(onToggle: () => void, onOpen: () => void = onToggle): void {
  const { parsed } = useShortcut();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!parsed || !matches(event, parsed)) return;
      event.preventDefault();
      onToggle();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
    };
  }, [onToggle, onOpen, parsed]);
}
