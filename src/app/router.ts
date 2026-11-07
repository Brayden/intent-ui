import { useMemo, useSyncExternalStore } from "react";

/*
 * Minimal client-side routing: "/" lists workspaces, "/w/:id" opens one, "/w/:id/:pageId?…" one
 * of its pages. The Worker serves index.html for unknown paths (single-page-application
 * fallback), so deep links work.
 */

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

/**
 * Navigates within the app without a page load (path may include a query string). `replace`
 * swaps the current history entry; `scroll: false` keeps the scroll position (same-page changes).
 */
export function navigate(path: string, { replace = false, scroll = true }: { replace?: boolean; scroll?: boolean } = {}): void {
  if (path === window.location.pathname + window.location.search) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  if (scroll) window.scrollTo(0, 0);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export type Route =
  | { name: "home" }
  /** A workspace page: `/w/:id` (its first page) or `/w/:id/:pageId?param=value…` (ADR 0011). */
  | { name: "workspace"; id: string; pageId?: string; params: Record<string, string> }
  | { name: "not-found" };

export function parseRoute(pathname: string, search = ""): Route {
  if (pathname === "/" || pathname === "") return { name: "home" };
  const workspace = pathname.match(/^\/w\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (workspace?.[1]) {
    const params = Object.fromEntries(new URLSearchParams(search));
    return { name: "workspace", id: decodeURIComponent(workspace[1]), pageId: workspace[2] && decodeURIComponent(workspace[2]), params };
  }
  return { name: "not-found" };
}

/** The current route; re-renders on navigation (path or query). */
export function useRoute(): Route {
  const location = useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search);
  return useMemo(() => {
    const url = new URL(location, window.location.origin);
    return parseRoute(url.pathname, url.search);
  }, [location]);
}
