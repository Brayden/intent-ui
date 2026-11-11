import { useCallback, useState } from "react";

/*
 * The host keeps a list of the user's generated views (a real product would store this per user
 * on its backend). Each one is an Intent UI document id.
 */
export type View = { id: string; title: string };

const KEY = "acme:views";

function load(): View[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as View[];
  } catch {
    return [];
  }
}

export function useViews() {
  const [views, setViews] = useState<View[]>(load);
  const add = useCallback((view: View) => {
    setViews((current) => {
      const next = [...current.filter((v) => v.id !== view.id), view];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Not saved; the view is still open in this tab.
      }
      return next;
    });
  }, []);
  return { views, add };
}
