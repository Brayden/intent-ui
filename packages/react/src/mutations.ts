import { useCallback, useEffect, useState } from "react";
import { STATE_ATTRIBUTE } from "./attributes";

/*
 * The master switch for everything Intent UI changes on the host's pages. Off shows the host's
 * default UI exactly as it ships: no patches, no generated pages (hosts render their own content
 * instead). The visitor's choice is remembered; `?intent-ui=off` or `?intent-ui=on` in the URL
 * overrides it for that page view (handy for support and screenshots) without being saved.
 */

const STORAGE_KEY = "intent-ui:mutations";
const URL_PARAM = "intent-ui";

function fromUrl(): boolean | null {
  const value = new URLSearchParams(window.location.search).get(URL_PARAM);
  return value === "off" ? false : value === "on" ? true : null;
}

function fromStorage(): boolean | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "off" ? false : value === "on" ? true : null;
  } catch {
    return null;
  }
}

export function useMutationsSwitch(defaultEnabled: boolean): { enabled: boolean; setEnabled: (enabled: boolean) => void } {
  const [enabled, setState] = useState(() => fromUrl() ?? fromStorage() ?? defaultEnabled);

  useEffect(() => {
    document.documentElement.setAttribute(STATE_ATTRIBUTE, enabled ? "on" : "off");
  }, [enabled]);

  const setEnabled = useCallback((next: boolean) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Storage unavailable (private window): the choice lasts for this page view.
    }
  }, []);

  return { enabled, setEnabled };
}
