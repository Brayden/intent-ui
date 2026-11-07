import { useToasts } from "../../../lib/useToasts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace } from "../../../../shared/spec";
import { ApiRequestError } from "../../../lib/api";
import { saveWorkspace } from "../api";

const DEBOUNCE_MS = 600;

export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";

/**
 * Autosaves the workspace shortly after each change (ADR 0008). Saves are sequential and use
 * optimistic concurrency: a stale version means it changed elsewhere, so the user is asked to
 * reload instead of overwriting. `flush` saves immediately (e.g. before a chat request).
 */
export function useAutosave(id: string, workspace: Workspace, initialVersion: number) {
  const toasts = useToasts();
  const [status, setStatus] = useState<SaveStatus>("saved");
  const version = useRef(initialVersion);
  const saved = useRef(workspace);
  const latest = useRef(workspace);
  const inFlight = useRef<Promise<void> | null>(null);
  latest.current = workspace;

  const save = useCallback(async (): Promise<void> => {
    await inFlight.current; // one save at a time, in order
    const spec = latest.current;
    if (spec === saved.current) return;
    setStatus("saving");
    const run = saveWorkspace(id, { spec, baseVersion: version.current })
      .then((result) => {
        version.current = result.version;
        saved.current = spec;
        setStatus(latest.current === spec ? "saved" : "pending");
      })
      .catch((error: unknown) => {
        const conflict = error instanceof ApiRequestError && error.status === 409;
        setStatus(conflict ? "conflict" : "error");
        toasts.add({
          title: conflict ? "This workspace changed elsewhere" : "Couldn't save",
          description: conflict ? "Reload to get the latest version; your last change wasn't saved." : (error as Error).message,
          variant: "error",
        });
      });
    inFlight.current = run;
    await run;
  }, [id, toasts]);

  useEffect(() => {
    if (workspace === saved.current) return;
    setStatus("pending");
    const timer = setTimeout(() => void save(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [workspace, save]);

  return { status, flush: save };
}
