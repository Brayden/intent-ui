import { useCallback, useEffect, useState } from "react";

export type Mode = "light" | "dark";

const current = (): Mode => (document.documentElement.dataset.mode === "dark" ? "dark" : "light");

/** The page's light/dark mode. Set in index.html before first paint; changing it is remembered. */
export function useTheme(): { mode: Mode; toggle: () => void } {
  const [mode, setMode] = useState<Mode>(current);

  // Follow OS changes (applied by index.html) while the visitor hasn't picked a mode.
  useEffect(() => {
    const observer = new MutationObserver(() => setMode(current()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
    return () => observer.disconnect();
  }, []);

  const toggle = useCallback(() => {
    const next: Mode = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.mode = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage can be unavailable (private windows); the choice then lasts for this page view.
    }
  }, []);

  return { mode, toggle };
}
