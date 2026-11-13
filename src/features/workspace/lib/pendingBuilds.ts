import type { GeneratePageRequest } from "../../../../shared/api";

/**
 * Pages being generated, remembered for this tab (sessionStorage), so a reload mid-build can
 * offer to build the page again instead of "Page not found" (ADR 0017). Best effort: storage can
 * be unavailable.
 */
export type PendingBuild = Omit<GeneratePageRequest, "spec">;

const key = (workspaceId: string, pageId: string) => `intent-ui:building:${workspaceId}:${pageId}`;

export function rememberBuild(workspaceId: string, pageId: string, request: PendingBuild): void {
  try {
    sessionStorage.setItem(key(workspaceId, pageId), JSON.stringify(request));
  } catch {
    // storage unavailable
  }
}

export function forgetBuild(workspaceId: string, pageId: string): void {
  try {
    sessionStorage.removeItem(key(workspaceId, pageId));
  } catch {
    // storage unavailable
  }
}

export function interruptedBuild(workspaceId: string, pageId: string): PendingBuild | null {
  try {
    const json = sessionStorage.getItem(key(workspaceId, pageId));
    return json ? (JSON.parse(json) as PendingBuild) : null;
  } catch {
    return null;
  }
}
