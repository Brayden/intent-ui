import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { useMemo, useRef } from "react";

type ToastManager = ReturnType<typeof useKumoToastManager>;

/**
 * Kumo's toast manager with a stable identity. `useKumoToastManager()` returns a new object
 * every render, so using it in effect or callback dependencies re-runs them on every render
 * (e.g. an infinite fetch loop). Always use this hook instead.
 */
export function useToasts(): Pick<ToastManager, "add" | "promise"> {
  const manager = useKumoToastManager();
  const latest = useRef(manager);
  latest.current = manager;
  return useMemo(
    () => ({
      add: ((options: Parameters<ToastManager["add"]>[0]) => latest.current.add(options)) as ToastManager["add"],
      promise: ((promise: Promise<unknown>, options: Parameters<ToastManager["promise"]>[1]) =>
        latest.current.promise(promise, options)) as ToastManager["promise"],
    }),
    [],
  );
}
