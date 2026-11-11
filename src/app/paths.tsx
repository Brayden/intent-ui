import { createContext, useContext } from "react";
import { pagePath } from "../../shared/spec";

/*
 * Where in-app links go. The standalone app lives at "/" and "/w/:id/:pageId"; a host embedding a
 * generated page (the SDK's <GeneratedPage>) mounts it under its own route and provides its own
 * paths, so navigation between generated pages stays inside the host's URL space.
 */
export type AppPaths = {
  /** The URL of a page in a workspace, with its route params. */
  page: (workspaceId: string, pageId: string, values?: Record<string, string>) => string;
  /** The list of all workspaces, or null when embedded (the host owns its navigation). */
  home: string | null;
};

export const DEFAULT_PATHS: AppPaths = { page: pagePath, home: "/" };

export const AppPathsContext = createContext<AppPaths>(DEFAULT_PATHS);

export const useAppPaths = (): AppPaths => useContext(AppPathsContext);
