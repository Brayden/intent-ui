import { LayerDialog } from "@cloudflare/kumo/components/layer-dialog";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  /** The confirm button's label, e.g. "Delete" or "Run". */
  action: string;
  destructive?: boolean;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Confirm | null>(null);

/** Hosts one Kumo alert dialog for `useConfirm()` (our rule: modals are LayerDialog). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>(
    (next) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <LayerDialog.Alert open onOpenChange={(open) => !open && settle(false)}>
          <LayerDialog.Content size="sm">
            <LayerDialog.Title>{options.title}</LayerDialog.Title>
            <LayerDialog.Body>{options.description}</LayerDialog.Body>
            <LayerDialog.Actions dismissLabel="Cancel">
              <LayerDialog.Action variant={options.destructive ? "destructive" : "primary"} onClick={() => settle(true)}>
                {options.action}
              </LayerDialog.Action>
            </LayerDialog.Actions>
          </LayerDialog.Content>
        </LayerDialog.Alert>
      )}
    </ConfirmContext.Provider>
  );
}

/** Asks the user to confirm; resolves true if they did. Must be inside `ConfirmProvider`. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider");
  return confirm;
}
