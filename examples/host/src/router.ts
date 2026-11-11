import { useSyncExternalStore } from "react";

/* The host's own (deliberately tiny) router. Intent UI only needs pushState + popstate. */

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function go(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function link(event: React.MouseEvent<HTMLAnchorElement>): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  go(event.currentTarget.getAttribute("href") ?? "/");
}
