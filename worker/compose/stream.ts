import type { DraftBlockHeader, DraftPageHeader, DraftStreamEvent, StreamEnd, ToolInfo } from "../../shared/api";
import {
  BlockNodeSchema,
  ComposeBlockSchema,
  dryRunRoute,
  isHtmlNode,
  LayoutOpSchema,
  PageParamSchema,
  SourceSchema,
  type Block,
  type Page,
  type RouteValues,
  type Source,
  type Workspace,
} from "../../shared/spec";
import type { Env } from "../env";
import { HttpError } from "../lib/http";
import { parsePartialJson } from "../llm/partialJson";
import type { LoopStatus } from "../llm/toolLoop";
import type { ToolInputDelta } from "../llm/anthropic";
import { memoizedToolCaller, type RunOptions } from "../data/sources";
import { computePage } from "../data/views";
import type { StyleEngine } from "../styles/engine";
import { compose, type ComposeProgress } from "./compose";
import { COMPOSE_TOOL } from "./tools";

/** How often the partial tool input is re-parsed while the model writes (ms). */
const PARSE_INTERVAL = 40;

const statusMessage = (status: LoopStatus): string => {
  switch (status.kind) {
    case "inspecting":
      return `Looking at ${status.detail}…`;
    case "searching":
      return "Searching the web…";
    case "checking":
      return "Checking the data…";
    case "repairing":
      return `Fixing ${status.issues.length === 1 ? "an issue" : `${status.issues.length} issues`}…`;
  }
};

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const split = (className: unknown) => (typeof className === "string" ? className.split(/\s+/).filter(Boolean) : []);

type Emit = (event: DraftStreamEvent) => void;

/** What a generated page looks like so far, from the tool input (ADR 0011). */
export type DraftPage = { header: DraftPageHeader; page: Page; route: RouteValues | null };

export type DraftOptions = {
  workspace: Workspace;
  pageId: string;
  route: RouteValues;
  styles: StyleEngine;
  /**
   * Generated pages: reads the page (title, params) from the input so far. `route` is null until
   * the params are known. Without it, the page is the workspace's (compose).
   */
  page?: (value: Record<string, unknown>, closed: WeakSet<object>) => DraftPage | null;
};

/**
 * Turns the model's compose_changes input, as it streams, into draft events (ADR 0017): each
 * source, layout op and node once it's complete, block headers as they grow, CSS for new
 * classes, and early data for each finished block, fetched while the model keeps writing.
 */
export class ComposeDraft {
  private callId = "";
  private json = "";
  private lastParse = 0;
  private sources = new Map<number, Source>();
  private layoutOps = new Set<number>();
  private headers = new Map<string, string>();
  private nodes = new Set<string>();
  private prefetched = new Set<string>();
  private classes = new Set<string>();
  private pageTitle: string | undefined;
  private pageParams: Workspace["pages"][string]["params"] | undefined;
  private draftPage: DraftPage | null = null;
  private pageKey = "";
  private pending: Promise<void>[] = [];
  private readonly workspace: Workspace;
  private readonly pageId: string;
  private readonly route: RouteValues;
  private readonly styles: StyleEngine;
  /** Shared with the final dry run, so data fetched early isn't fetched again. */
  readonly runOptions: RunOptions = { callTool: memoizedToolCaller() };

  constructor(
    private readonly emit: Emit,
    private readonly options: DraftOptions,
  ) {
    this.workspace = options.workspace;
    this.pageId = options.pageId;
    this.route = options.route;
    this.styles = options.styles;
  }

  /** The compose_changes input so far. A new call id (a repair) starts the draft over. */
  update(callId: string, json: string): void {
    if (callId !== this.callId) {
      if (this.callId) this.emit({ type: "reset" });
      this.reset(callId);
    }
    this.json = json;
    const now = Date.now();
    if (now - this.lastParse >= PARSE_INTERVAL) this.flush();
  }

  /** Parses whatever has arrived and emits what's new. */
  flush(): void {
    if (!this.json) return;
    this.lastParse = Date.now();
    let parsed;
    try {
      parsed = parsePartialJson(this.json);
    } catch {
      return; // not valid JSON; the final validation reports it
    }
    const { value, closed } = parsed;
    if (!isObject(value)) return;
    const newClasses: string[] = [];
    const noteClasses = (className: unknown) => {
      for (const token of split(className)) {
        if (!this.classes.has(token)) {
          this.classes.add(token);
          newClasses.push(token);
        }
      }
    };

    if (Array.isArray(value.sources)) {
      value.sources.forEach((item, index) => {
        if (this.sources.has(index) || !isObject(item) || !closed.has(item)) return;
        const source = SourceSchema.safeParse(item);
        if (!source.success) return;
        this.sources.set(index, source.data);
        this.emit({ type: "source", source: source.data });
      });
    }
    if (Array.isArray(value.layoutOps)) {
      value.layoutOps.forEach((item, index) => {
        if (this.layoutOps.has(index) || !isObject(item) || !closed.has(item)) return;
        const op = LayoutOpSchema.safeParse(item);
        if (!op.success) return;
        this.layoutOps.add(index);
        if (op.data.op === "upsert") noteClasses((op.data.node as { className?: unknown }).className);
        this.emit({ type: "layout", op: op.data });
      });
    }
    if (this.options.page) {
      const page = this.options.page(value, closed);
      const key = JSON.stringify(page && { header: page.header, route: page.route });
      if (page && key !== this.pageKey) {
        this.pageKey = key;
        this.draftPage = page;
        this.emit({ type: "page", page: page.header, ...(page.route ? { route: page.route } : {}) });
      }
    }
    if (typeof value.pageTitle === "string" && value.pageTitle !== this.pageTitle) {
      this.pageTitle = value.pageTitle;
      this.emit({ type: "pageTitle", title: value.pageTitle });
    }
    if (isObject(value.pageParams) && closed.has(value.pageParams)) {
      const params: NonNullable<typeof this.pageParams> = {};
      for (const [name, param] of Object.entries(value.pageParams)) {
        const checked = PageParamSchema.safeParse(param);
        if (checked.success) params[name] = checked.data;
      }
      this.pageParams = params;
    }

    if (Array.isArray(value.newBlocks)) {
      for (const item of value.newBlocks) {
        if (!isObject(item) || typeof item.id !== "string" || typeof item.slot !== "string") continue;
        const header: DraftBlockHeader = { id: item.id, slot: item.slot };
        if (typeof item.order === "number") header.order = item.order;
        if (typeof item.title === "string") header.title = item.title;
        if (isObject(item.frame) && closed.has(item.frame)) header.frame = item.frame as DraftBlockHeader["frame"];
        if (typeof item.root === "string") header.root = item.root;
        if (typeof item.toolbar === "string") header.toolbar = item.toolbar;
        if (isObject(item.inputs) && closed.has(item.inputs)) header.inputs = item.inputs as Record<string, string>;
        const key = JSON.stringify(header);
        if (this.headers.get(item.id) !== key) {
          this.headers.set(item.id, key);
          this.emit({ type: "block", block: header });
        }
        if (isObject(item.nodes)) {
          for (const [id, node] of Object.entries(item.nodes)) {
            const nodeKey = `${item.id}\u0000${id}`;
            if (this.nodes.has(nodeKey) || !isObject(node) || !closed.has(node)) continue;
            const checked = BlockNodeSchema.safeParse(node);
            if (!checked.success) continue;
            this.nodes.add(nodeKey);
            if (isHtmlNode(checked.data)) noteClasses(checked.data.className);
            this.emit({ type: "node", blockId: item.id, id, node: checked.data });
          }
        }
        if (closed.has(item)) this.prefetch(item);
      }
    }

    if (newClasses.length > 0) {
      this.pending.push(
        this.styles.css(newClasses).then(
          (css) => void (css && this.emit({ type: "css", css })),
          () => {},
        ),
      );
    }
  }

  /** Waits for early data and CSS still in flight (they're best-effort). */
  async settle(): Promise<void> {
    await Promise.allSettled(this.pending);
  }

  private reset(callId: string): void {
    this.callId = callId;
    this.json = "";
    this.sources.clear();
    this.layoutOps.clear();
    this.headers.clear();
    this.nodes.clear();
    this.prefetched.clear();
    this.pageTitle = undefined;
    this.pageParams = undefined;
    this.draftPage = null;
    this.pageKey = "";
  }

  /** Fetches a finished block's data now, if every source it reads is known. */
  private prefetch(item: Record<string, unknown>): void {
    const parsed = ComposeBlockSchema.safeParse(item);
    if (!parsed.success || this.prefetched.has(parsed.data.id)) return;
    const sources = { ...this.workspace.sources };
    for (const source of this.sources.values()) sources[source.id] = source;
    if (Object.values(parsed.data.inputs).some((sourceId) => !sources[sourceId])) return; // try again when they arrive
    let page: Page | undefined;
    let values: RouteValues;
    if (this.options.page) {
      // A generated page: wait until its params (and so the clicked item's values) are known.
      if (!this.draftPage?.route) return;
      page = this.draftPage.page;
      values = this.draftPage.route;
    } else {
      const current = this.workspace.pages[this.pageId];
      if (!current) return;
      page = { ...current, params: this.pageParams ?? current.params };
      const dry = dryRunRoute(page, this.route);
      if (dry.missing.length > 0) return;
      values = dry.values;
    }
    this.prefetched.add(parsed.data.id);
    const block: Block = { ...parsed.data, page: this.pageId, ui: {} };
    const draft: Workspace = { ...this.workspace, pages: { ...this.workspace.pages, [this.pageId]: page }, sources, blocks: { ...this.workspace.blocks, [block.id]: block } };
    const callId = this.callId;
    this.pending.push(
      computePage(draft, this.pageId, values, this.runOptions, [block.id]).then(
        ({ views }) => {
          const view = views[block.id];
          // Only for the attempt that asked; a repair may have replaced the block.
          if (view && !view.error && callId === this.callId) this.emit({ type: "view", blockId: block.id, view });
        },
        () => {},
      ),
    );
  }
}

/**
 * Answers with server-sent events: what `run` emits while it works, then `result` with its value,
 * or `error`. Each event is one JSON object on a `data:` line (ADR 0017).
 */
export function eventStream<R>(label: string, run: (emit: Emit) => Promise<R>): Response {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const started = Date.now();
  let firstDraft = 0;
  let open = true;
  const write = (event: DraftStreamEvent | StreamEnd<R>) => {
    if (!open) return;
    if (!firstDraft && !["status", "reset", "page", "result", "error"].includes(event.type)) firstDraft = Date.now() - started;
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)).catch(() => (open = false)); // the client went away
  };

  void (async () => {
    try {
      const result = await run(write);
      write({ type: "result", result });
      console.log(`[${label}] streamed: first draft ${firstDraft ? `${firstDraft} ms` : "none"}, result ${Date.now() - started} ms`);
    } catch (error) {
      const http = error instanceof HttpError ? error : null;
      write({ type: "error", error: http?.message ?? (error as Error).message ?? `${label} failed`, details: http?.details });
    } finally {
      open = false;
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
}

/** Tool-loop hooks that feed `toolName`'s streaming input into `draft` and report progress. */
export function draftProgress(draft: ComposeDraft, emit: Emit, toolName: string): ComposeProgress {
  return {
    onToolInput: (delta: ToolInputDelta & { attempt: number }) => {
      // Each attempt starts a new draft, even if the model reuses a call id.
      if (delta.name === toolName) draft.update(`${delta.attempt}:${delta.id}`, delta.json);
    },
    onStatus: (status: LoopStatus) => {
      if (status.kind === "checking") draft.flush();
      emit({ type: "status", message: statusMessage(status) });
    },
    runOptions: draft.runOptions,
  };
}

/** Runs compose as a stream of draft events, ending with the validated result. */
export function composeStream(
  env: Env,
  prompt: string,
  workspace: Workspace,
  pageId: string,
  tools: ToolInfo[],
  styles: StyleEngine,
  route: RouteValues,
): Response {
  return eventStream("compose", (emit) => {
    const draft = new ComposeDraft(emit, { workspace, pageId, route, styles });
    return compose(env, prompt, workspace, pageId, tools, styles, route, draftProgress(draft, emit, COMPOSE_TOOL.name));
  });
}
