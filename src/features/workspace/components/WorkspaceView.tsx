import { useToasts } from "../../../lib/useToasts";
import { Button } from "@cloudflare/kumo/components/button";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Text } from "@cloudflare/kumo/components/text";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ComposeResponse, GeneratePageResponse, Template, WorkspaceResponse } from "../../../../shared/api";
import { missingParams as missingRouteParams, pickRoute, routeDependentBlocks, routeFromItem, type Block } from "../../../../shared/spec";
import { useAppPaths } from "../../../app/paths";
import { navigate } from "../../../app/router";
import { ChangePrompt, useAmend } from "../../amend";
import { CommandMenu, useCommandShortcut, useShortcut } from "../../command";
import { blockContext, OverlayHost, useIntentRuntime } from "../../intents";
import { DispatchProvider, injectSpecCss, PageRenderer, RouteValuesProvider, TargetProvider } from "../../renderer";
import { composePage, generatePage, putTemplate } from "../api";
import { useAutosave } from "../hooks/useAutosave";
import { useResearch } from "../hooks/useResearch";
import { useWorkspace } from "../hooks/useWorkspace";
import { useWorkspaceData } from "../hooks/useWorkspaceData";
import { SAVE_STATUS_TEXT } from "../lib/saveStatus";
import { shareViews } from "../lib/shareViews";

/**
 * A live, saved workspace: renders its page with data, runs actions (deferred intents, tools),
 * lets the user right-click anything to change it, and builds from the ⌘K command menu, the
 * only app chrome, so the generated UI has the whole screen (ADR 0010). Every change autosaves
 * (ADR 0008). Shows the page in the URL (`pageId`, else the first page) with its route values
 * (ADR 0011). Must be inside Kumo's `Toasty`.
 */
export function WorkspaceView({ stored, pageId: requestedPageId, params }: { stored: WorkspaceResponse; pageId?: string; params: Record<string, string> }) {
  const toasts = useToasts();
  const paths = useAppPaths();
  const shortcut = useShortcut().label;
  const { workspace, replaceBlockTree, setBlockUi, applyPage, applyCompose, applyBlockDataChange, replaceSource, addPage, setPageParams } =
    useWorkspace(stored.spec);
  const homePageId = Object.keys(workspace.pages)[0] ?? "home";
  const pageId = requestedPageId ?? homePageId;
  const page = workspace.pages[pageId];
  const route = useMemo(() => pickRoute(page, params), [page, params]);
  const missingParams = page ? missingRouteParams(page, route) : [];
  const { status, flush } = useAutosave(stored.id, workspace, stored.version);
  // Snapshots are per block, so pages with params (different data per URL) start without them.
  const snapshots = useMemo(
    () => Object.fromEntries(Object.entries(stored.views).filter(([id]) => Object.keys(stored.spec.pages[stored.spec.blocks[id]?.page ?? ""]?.params ?? {}).length === 0)),
    [stored],
  );
  const routeBlocks = useMemo(() => routeDependentBlocks(workspace, pageId), [workspace, pageId]);
  const { views, refresh, merge } = useWorkspaceData(stored.id, pageId, route, snapshots, flush, routeBlocks);
  const blockViews = shareViews(workspace, views);
  const latest = useRef(workspace);
  latest.current = workspace;

  const research = useResearch({
    workspaceId: stored.id,
    latest: useCallback(() => latest.current, []),
    flush,
    onSource: replaceSource,
    onRefresh: refresh,
  });

  const persistTemplate = useCallback(
    (template: Template, aliasKey?: string) =>
      void putTemplate(stored.id, template, aliasKey).catch((error: Error) =>
        toasts.add({ title: "Couldn't save generated UI", description: error.message, variant: "error" }),
      ),
    [stored.id, toasts],
  );

  const goTo = useCallback(
    (target: string, values: Record<string, string> = {}) => navigate(paths.page(stored.id, target, values)),
    [stored.id, paths],
  );

  /** Sets a route param of the current page (a search box, a filter): the URL changes, data follows (ADR 0013). */
  const setRoute = useCallback(
    (name: string, value: unknown, replace: boolean) => {
      const next = { ...route };
      if (value === undefined || value === null || String(value).trim() === "") delete next[name];
      else next[name] = String(value);
      navigate(paths.page(stored.id, pageId, next), { replace, scroll: false });
    },
    [route, stored.id, pageId, paths],
  );

  /** Opens the page an intent leads to: straight there if it exists, else generated first (ADR 0011). */
  const openPage = useCallback(
    async (intent: { id: string; prompt: string }, from: Block, item: unknown) => {
      const existing = Object.values(latest.current.pages).find((candidate) => candidate.intent?.id === intent.id);
      if (existing) {
        const { values, missing } = routeFromItem(existing, item);
        if (missing.length > 0) {
          toasts.add({ title: "Can't open that page from here", description: `It needs: ${missing.join(", ")}`, variant: "warning" });
          return;
        }
        return goTo(existing.id, values);
      }
      try {
        await flush();
        const request = { intent, item, from: { pageId, block: blockContext(from, latest.current) }, spec: latest.current };
        const result = await toasts.promise(generatePage(stored.id, request), {
          loading: { title: "Building this page for the first time…", description: intent.prompt },
          success: (done: GeneratePageResponse) =>
            done.status === "declined"
              ? { title: "Can't build that page", description: done.reason, variant: "warning" }
              : { title: "Built", description: `${done.summary} Opens instantly next time.`, variant: "success" },
          error: (error: Error) => ({ title: "Couldn't build that page", description: error.message, variant: "error" }),
        });
        if (result.status === "declined") return;
        injectSpecCss(result.css);
        addPage(result.page, result.changes);
        merge(result.views);
        goTo(result.page.id, result.route);
      } catch {
        // surfaced by the toast
      }
    },
    [flush, goTo, merge, addPage, pageId, stored.id, toasts],
  );

  const { dispatch, overlay, updateTemplate } = useIntentRuntime({
    workspace,
    views: blockViews,
    // The server refreshes from the saved spec, so save pending edits first.
    onRefresh: () => void flush().then(refresh),
    onSetUi: setBlockUi,
    onResearch: research,
    onOpenPage: openPage,
    onNavigate: goTo,
    onSetRoute: setRoute,
    library: { templates: stored.templates, aliases: stored.aliases },
    onPersistTemplate: persistTemplate,
  });
  const compose = async (prompt: string): Promise<boolean> => {
    try {
      await flush();
      const result = await toasts.promise(composePage(stored.id, { prompt, pageId, route, spec: latest.current }), {
        loading: { title: "Building…", description: prompt },
        success: (done: ComposeResponse) =>
          done.status === "declined"
            ? { title: "Can't build that yet", description: done.reason, variant: "warning" }
            : { title: "Updated", description: done.summary, variant: "success" },
        error: (error: Error) => ({ title: "Couldn't build that", description: error.message, variant: "error" }),
      });
      if (result.status === "declined") return false;
      injectSpecCss(result.css);
      applyCompose(pageId, result.changes);
      merge(result.views);
      // A page with params (ADR 0012): open it with the dry run's values if the URL has none;
      // otherwise reload for the current values (the dry run may have used examples).
      const params = Object.keys(result.changes.pageParams ?? page?.params ?? {});
      if (params.length > 0) {
        if (params.some((name) => !route[name])) goTo(pageId, result.route);
        else void refresh();
      }
      return true;
    } catch {
      return false; // surfaced by the toast
    }
  };

  const amend = useAmend({
    workspace,
    views: blockViews,
    overlay,
    route,
    onBlockTree: replaceBlockTree,
    onTemplate: updateTemplate,
    onPage: applyPage,
    onData: applyBlockDataChange,
    onViews: merge,
    onPageEdit: compose,
    onPageParams: setPageParams,
  });


  const isEmpty = !Object.values(workspace.blocks).some((block) => block.page === pageId);
  // A blank workspace opens straight into the menu: describing what to build is the first step.
  const [menuOpen, setMenuOpen] = useState(isEmpty);
  useCommandShortcut(
    useCallback(() => setMenuOpen((open) => !open), []),
    useCallback(() => setMenuOpen(true), []),
  );
  const onRefresh = useCallback(() => void flush().then(refresh), [flush, refresh]);

  const commandMenu = (
    <CommandMenu
      open={menuOpen}
      onOpenChange={setMenuOpen}
      workspaceId={stored.id}
      pages={Object.values(workspace.pages).filter((candidate) => candidate.id !== pageId && Object.keys(candidate.params).length === 0)}
      onOpenPage={(target) => goTo(target)}
      onGenerate={compose}
      onRefresh={onRefresh}
      placeholder={isEmpty ? "Describe what you want to build…" : "Ask for a change or something new, or search…"}
      status={SAVE_STATUS_TEXT[status]}
    />
  );

  if (!page || missingParams.length > 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Empty
          title={page ? `This page needs ${missingParams.join(", ")}` : "Page not found"}
          description={page ? "Open it from a link or button that knows which one to show." : `This workspace has no page "${pageId}".`}
          contents={<Button onClick={() => goTo(homePageId)}>Go to {workspace.pages[homePageId]?.title ?? "the first page"}</Button>}
        />
        {commandMenu}
      </div>
    );
  }

  return (
    <DispatchProvider dispatch={dispatch}>
      <div>
        <TargetProvider onTarget={amend.open}>
          <RouteValuesProvider route={route}>
            <PageRenderer workspace={workspace} pageId={pageId} views={blockViews} />
            <OverlayHost overlay={overlay} workspace={workspace} />
          </RouteValuesProvider>
        </TargetProvider>
        {isEmpty && (
          // Centered over the (full-height) page, which may still have layout content of its own.
          <div className="pointer-events-none fixed inset-0 flex items-center justify-center px-6">
            <div className="pointer-events-auto flex max-w-xl flex-col items-center gap-2 text-center">
              <Text variant="heading2" as="h1">
                What do you want to build?
              </Text>
              <Text variant="secondary">
                {shortcut ? `Press ${shortcut} and describe it` : "Describe it"}, for example “Show me all the members of my team
                with their open pull requests.” Right-click anything afterwards to change it.
              </Text>
              <Button variant="primary" className="mt-2" onClick={() => setMenuOpen(true)}>
                Describe it
              </Button>
            </div>
          </div>
        )}
      </div>
      {amend.target && (
        <ChangePrompt
          key={`${amend.target.point.x},${amend.target.point.y}`}
          target={amend.target}
          pending={amend.pending}
          onSubmit={amend.submit}
          onClose={amend.close}
        />
      )}
      {commandMenu}
    </DispatchProvider>
  );
}
