import { Banner } from "@cloudflare/kumo/components/banner";
import { Loader } from "@cloudflare/kumo/components/loader";
import { useEffect, useState } from "react";
import type { WorkspaceResponse } from "../../../../shared/api";
import { injectSpecCss } from "../../renderer";
import { getWorkspace } from "../api";
import { WorkspaceView } from "./WorkspaceView";

/** Loads a saved workspace (spec, templates, CSS, view snapshots), then renders it. */
type WorkspacePageProps = { id: string; pageId?: string; params: Record<string, string> };

export function WorkspacePage({ id, pageId, params }: WorkspacePageProps) {
  const [stored, setStored] = useState<WorkspaceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWorkspace(id)
      .then((result) => {
        if (cancelled) return;
        injectSpecCss(result.css);
        setStored(result);
      })
      .catch((cause: Error) => !cancelled && setError(cause.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Banner variant="error" title="Couldn't open this workspace" description={error} />
      </div>
    );
  }
  if (!stored) {
    return (
      <div className="flex justify-center p-24">
        <Loader size={24} />
      </div>
    );
  }
  return <WorkspaceView key={stored.id} stored={stored} pageId={pageId} params={params} />;
}
