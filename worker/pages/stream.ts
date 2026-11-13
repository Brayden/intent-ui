import type { BlockContext, DraftPageHeader, ToolInfo } from "../../shared/api";
import { blankWorkspace, routeFromItem, type Page, type Workspace } from "../../shared/spec";
import { ComposeDraft, draftProgress, eventStream, isObject, type DraftPage } from "../compose/stream";
import type { Env } from "../env";
import type { StyleEngine } from "../styles/engine";
import { CREATE_PAGE_TOOL, CreatePageParamSchema, generatePage, pageIdFor } from "./generate";

/**
 * Generates the page an intent opens as a stream (ADR 0011, 0017). The first event names the page,
 * so the client can open it at once; the next adds its title and route values (for the clicked
 * item) as soon as the model has written them; then the page's blocks stream in like compose.
 */
export function generatePageStream(
  env: Env,
  request: { intent: { id: string; prompt: string }; item?: unknown; from: { pageId: string; block?: BlockContext } },
  workspace: Workspace,
  tools: ToolInfo[],
  styles: StyleEngine,
): Response {
  const pageId = pageIdFor(request.intent.id, workspace);
  const layout = blankWorkspace("").pages.home!.layout;
  const blank: Page = { id: pageId, title: "", layout, params: {}, intent: request.intent };
  // The draft builds into the page as it will be created: empty layout, params once known.
  const withPage: Workspace = { ...workspace, pages: { ...workspace.pages, [pageId]: blank } };

  const readPage = (value: Record<string, unknown>, closed: WeakSet<object>): DraftPage => {
    const header: DraftPageHeader = { id: pageId, intent: request.intent };
    if (typeof value.title === "string") header.title = value.title;
    // Params are known when complete, or when the model has moved on without writing any.
    const movedOn = ["sources", "layoutOps", "newBlocks", "placements", "summary"].some((key) => key in value);
    let params: Page["params"] | undefined;
    if (isObject(value.params) && closed.has(value.params)) {
      params = {};
      for (const [name, param] of Object.entries(value.params)) {
        const checked = CreatePageParamSchema.safeParse(param);
        if (checked.success) params[name] = checked.data;
      }
    } else if (value.params === undefined && movedOn) params = {};
    if (!params) return { header, page: { ...blank, title: header.title ?? "" }, route: null };
    header.params = params;
    const page: Page = { ...blank, title: header.title ?? "", params };
    const route = routeFromItem(page, request.item);
    // Values missing from the item are a validation issue for the final check; open without them.
    return { header, page, route: route.values };
  };

  return eventStream("page", (emit) => {
    emit({ type: "page", page: { id: pageId, intent: request.intent } });
    const draft = new ComposeDraft(emit, { workspace: withPage, pageId, route: {}, styles, page: readPage });
    return generatePage(env, request, workspace, tools, styles, draftProgress(draft, emit, CREATE_PAGE_TOOL.name));
  });
}
