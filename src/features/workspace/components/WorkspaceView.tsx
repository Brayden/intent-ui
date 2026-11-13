import { useToasts } from "../../../lib/useToasts";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { MagicWandIcon } from "@phosphor-icons/react";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Text } from "@cloudflare/kumo/components/text";
import { useCallback, useMemo, useRef, useState } from "react";
import type { DraftStreamEvent, Template, WorkspaceResponse } from "../../../../shared/api";
import { missingParams as missingRouteParams, pickRoute, routeDependentBlocks, routeFromItem, type Block } from "../../../../shared/spec";
import { useAppPaths } from "../../../app/paths";
import { navigate } from "../../../app/router";
import { ChangePrompt, useAmend } from "../../amend";
import { CommandMenu, useCommandShortcut, useShortcut } from "../../command";
import { blockContext, OverlayHost, useIntentRuntime } from "../../intents";
import { DispatchProvider, DraftProvider, injectSpecCss, PageRenderer, RouteValuesProvider, TargetProvider } from "../../renderer";
import { composePageStream, generatePageStream, putTemplate } from "../api";
import { draftViews, draftWorkspace, EMPTY_DRAFT, reduceDraft, type ComposeDraft } from "../lib/composeDraft";
import { forgetBuild, interruptedBuild, rememberBuild, type PendingBuild } from "../lib/pendingBuilds";
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
  // Pages being written, by page id (ADR 0017): a compose on an existing page, or a generated page
  // that won't exist until its result. Drafts render but are never saved.
  const [drafts, setDrafts] = useState<Record<string, ComposeDraft>>({});
  const draft = drafts[pageId] ?? null;
  const shown = useMemo(() => (draft ? draftWorkspace(workspace, pageId, draft) : workspace), [draft, workspace, pageId]);
  const generating = draft !== null && !workspace.pages[pageId];
  const page = shown.pages[pageId];
  const route = useMemo(() => pickRoute(page, params), [page, params]);
  const missingParams = page && !draft ? missingRouteParams(page, route) : [];
  const currentPage = useRef(pageId);
  currentPage.current = pageId;
  const { status, flush } = useAutosave(stored.id, workspace, stored.version);
  // Snapshots are per block, so pages with params (different data per URL) start without them.
  const snapshots = useMemo(
    () => Object.fromEntries(Object.entries(stored.views).filter(([id]) => Object.keys(stored.spec.pages[stored.spec.blocks[id]?.page ?? ""]?.params ?? {}).length === 0)),
    [stored],
  );
  const routeBlocks = useMemo(() => routeDependentBlocks(workspace, pageId), [workspace, pageId]);
  const { views, refresh, merge } = useWorkspaceData(stored.id, pageId, route, snapshots, flush, routeBlocks, generating || !page);
  const blockViews = shareViews(workspace, views);
  const shownViews = useMemo(() => (draft ? { ...blockViews, ...draftViews(draft) } : blockViews), [draft, blockViews]);

  const updateDraft = useCallback((id: string, event: DraftStreamEvent) => {
    if (event.type === "css") injectSpecCss(event.css);
    else setDrafts((all) => ({ ...all, [id]: reduceDraft(all[id] ?? EMPTY_DRAFT, event) }));
  }, []);
  const dropDraft = useCallback((id: string) => setDrafts(({ [id]: _dropped, ...rest }) => rest), []);
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

  // Intent id → the page being generated for it (null until named), so a second click joins it.
  const building = useRef(new Map<string, string | null>());

  /**
   * Generates an intent's page and opens it right away (ADR 0011, 0017): the first event names
   * the page, so the user watches it build at its own URL. On success it's added and saved; if
   * the user has moved on, a toast offers to open it. On failure the user is taken back.
   */
  const buildPage = useCallback(
    async (request: PendingBuild) => {
      const intentId = request.intent.id;
      if (building.current.has(intentId)) {
        const id = building.current.get(intentId);
        if (id) goTo(id);
        return;
      }
      building.current.set(intentId, null);
      let builtId: string | null = null;
      const leave = () => {
        // Back to where the user came from, if they're still watching the page that failed.
        if (builtId && currentPage.current === builtId) window.history.back();
      };
      try {
        await flush();
        const result = await generatePageStream(stored.id, { ...request, spec: latest.current }, (event) => {
          if (event.type === "page") {
            const first = builtId === null;
            builtId = event.page.id;
            building.current.set(intentId, builtId);
            updateDraft(builtId, event);
            if (first) {
              rememberBuild(stored.id, builtId, request);
              navigate(paths.page(stored.id, builtId, event.route ?? {}));
            } else if (event.route && currentPage.current === builtId) {
              // Its params are known: show the item's values in the URL.
              navigate(paths.page(stored.id, builtId, event.route), { replace: true, scroll: false });
            }
          } else if (builtId) updateDraft(builtId, event);
        });
        if (result.status === "declined") {
          toasts.add({ title: "Can't build that page", description: result.reason, variant: "warning" });
          leave();
          return;
        }
        injectSpecCss(result.css);
        addPage(result.page, result.changes);
        merge(result.views);
        if (currentPage.current === result.page.id) {
          navigate(paths.page(stored.id, result.page.id, result.route), { replace: true, scroll: false });
          toasts.add({ title: "Built", description: `${result.summary} Opens instantly next time.`, variant: "success" });
        } else {
          toasts.add({
            title: `${result.page.title} is ready`,
            description: result.summary,
            variant: "success",
            actions: [{ children: "Open", onClick: () => goTo(result.page.id, result.route) }],
          });
        }
      } catch (error) {
        toasts.add({ title: "Couldn't build that page", description: (error as Error).message, variant: "error" });
        leave();
      } finally {
        building.current.delete(intentId);
        if (builtId) {
          dropDraft(builtId);
          forgetBuild(stored.id, builtId);
        }
      }
    },
    [flush, goTo, merge, addPage, updateDraft, dropDraft, paths, stored.id, toasts],
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
      void buildPage({ intent, item, from: { pageId, block: blockContext(from, latest.current) } });
    },
    [goTo, buildPage, pageId, toasts],
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
    if (drafts[pageId]) {
      toasts.add({ title: "This page is still being built", description: "Try again when it's done.", variant: "warning" });
      return false;
    }
    try {
      await flush();
      setDrafts((all) => ({ ...all, [pageId]: EMPTY_DRAFT }));
      const request = composePageStream(stored.id, { prompt, pageId, route, spec: latest.current }, (event) => updateDraft(pageId, event));
      // The status pill shows progress while the page is written; a toast reports the outcome.
      const result = await request.catch((error: Error) => {
        toasts.add({ title: "Couldn't build that", description: error.message, variant: "error" });
        throw error;
      });
      toasts.add(
        result.status === "declined"
          ? { title: "Can't build that yet", description: result.reason, variant: "warning" }
          : { title: "Updated", description: result.summary, variant: "success" },
      );
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
    } finally {
      dropDraft(pageId);
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
  const [menuOpen, setMenuOpen] = useState(isEmpty && workspace.pages[pageId] !== undefined);
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

  const interrupted = !page ? interruptedBuild(stored.id, pageId) : null;
  if (interrupted) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Empty
          title="This page was still being built"
          description="It stopped when the page reloaded. Build it again, or go back."
          contents={
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => {
                forgetBuild(stored.id, pageId);
                window.history.replaceState(null, "", paths.page(stored.id, interrupted.from.pageId, {}));
                void buildPage(interrupted);
              }}>
                Build it again
              </Button>
              <Button onClick={() => {
                forgetBuild(stored.id, pageId);
                goTo(interrupted.from.pageId);
              }}>
                Go back
              </Button>
            </div>
          }
        />
        {commandMenu}
      </div>
    );
  }

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
        <TargetProvider onTarget={draft ? ignoreTarget : amend.open}>
          <RouteValuesProvider route={route}>
            <DraftProvider draft={draft !== null}>
              <PageRenderer workspace={shown} pageId={pageId} views={shownViews} />
            </DraftProvider>
            <OverlayHost overlay={overlay} workspace={workspace} />
          </RouteValuesProvider>
        </TargetProvider>
        {draft && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-6" role="status" aria-live="polite">
            {generating ? (
              // A page that doesn't exist yet (ADR 0011): say it's new, and that it's a one-time wait.
              <div data-first-build="" className="flex items-center gap-2 rounded-full border border-kumo-brand bg-kumo-base px-4 py-2 shadow-lg">
                {/* The border's brand color (Kumo's text-kumo-brand utility is a different color). */}
                <MagicWandIcon size={16} weight="fill" className="shrink-0 animate-pulse" style={{ color: "var(--color-kumo-brand)" }} />
                <span className="text-sm font-medium text-kumo-default">Building this page for the first time</span>
                {draft.status && (
                  <Text size="sm" variant="secondary">
                    · {draft.status}
                  </Text>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full border border-kumo-line bg-kumo-base px-4 py-2 shadow-lg">
                <Loader size={14} />
                <Text size="sm">{draft.status ?? "Building…"}</Text>
              </div>
            )}
          </div>
        )}
        {isEmpty && !draft && (
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

/** Right-clicks do nothing while a page is being written: its draft nodes aren't saved yet. */
const ignoreTarget = () => {};
