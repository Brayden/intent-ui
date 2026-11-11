import { Button } from "@cloudflare/kumo/components/button";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Loader } from "@cloudflare/kumo/components/loader";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppPathsContext, type AppPaths } from "../../../src/app/paths";
import { createWorkspace, WorkspacePage } from "../../../src/features/workspace";
import { useIntentUI } from "./context";

type GeneratedPageProps = {
  /**
   * The route this page is mounted at in the host, e.g. "/views/team-prs". Its sub-pages (made
   * when an intent opens a page) live under it: "/views/team-prs/<pageId>?param=…".
   */
  basePath: string;
  /** The document to show. Omit to start from scratch: a blank one is created and `onCreate` called. */
  id?: string;
  /** Called with the new document id when the page started from scratch; store it to reopen it. */
  onCreate?: (id: string) => void;
  /** Title for a new document. */
  title?: string;
  /** Shown instead while customizations are switched off (the host's default for this route). */
  children?: ReactNode;
};

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

/** The sub-page and route params under `basePath` in the current URL. */
function useLocationUnder(basePath: string): { pageId?: string; params: Record<string, string> } {
  const location = useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search);
  return useMemo(() => {
    const url = new URL(location, window.location.origin);
    const rest = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) : "";
    const pageId = rest.split("/").filter(Boolean)[0];
    return { pageId: pageId && decodeURIComponent(pageId), params: Object.fromEntries(url.searchParams) };
  }, [location, basePath]);
}

/**
 * A fully generated page inside the host's app: drop it into a route (or as a child of one). It
 * brings the whole Intent UI experience scoped to that route: ⌘K to describe and build, right-click
 * to change, intents that generate on first click, and pages of its own under `basePath`.
 */
export function GeneratedPage({ basePath, id, onCreate, title = "Untitled page", children }: GeneratedPageProps) {
  const { mutationsEnabled, setMutationsEnabled } = useIntentUI();
  const base = basePath.replace(/\/+$/, "");
  const { pageId, params } = useLocationUnder(base);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const creating = useRef(false);
  const documentId = id ?? createdId;

  // Starting from scratch: create once (StrictMode runs effects twice in development).
  useEffect(() => {
    if (id || createdId || creating.current || !mutationsEnabled) return;
    creating.current = true;
    createWorkspace({ title })
      .then(({ id: created }) => {
        setCreatedId(created);
        onCreate?.(created);
      })
      .catch((cause: Error) => setError(cause.message));
  }, [id, createdId, mutationsEnabled, title, onCreate]);

  const paths = useMemo<AppPaths>(
    () => ({
      page: (_workspaceId, target, values = {}) => {
        const query = new URLSearchParams(values).toString();
        return `${base}/${encodeURIComponent(target)}${query ? `?${query}` : ""}`;
      },
      home: null,
    }),
    [base],
  );

  if (!mutationsEnabled) {
    return (
      children ?? (
        <div className="px-4 py-24">
          <Empty
            title="Customizations are off"
            description="This page was generated with Intent UI. Turn customizations back on to see it."
            contents={<Button onClick={() => setMutationsEnabled(true)}>Turn on</Button>}
          />
        </div>
      )
    );
  }
  if (error) return <Empty title="Couldn't create this page" description={error} />;
  if (!documentId) {
    return (
      <div className="flex justify-center py-24">
        <Loader />
      </div>
    );
  }
  return (
    <AppPathsContext.Provider value={paths}>
      {/* Generated pages have their own right-click editing; host editing skips this region. */}
      <div data-iui-region="generated-page" style={{ display: "contents" }}>
        <WorkspacePage key={documentId} id={documentId} pageId={pageId} params={params} />
      </div>
    </AppPathsContext.Provider>
  );
}
