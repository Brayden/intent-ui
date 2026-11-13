import type { BlockFrame, BlockNode, BlockView, LayoutOp, PageParam, Source } from "../spec";
import type { ComposeResponse, GeneratePageResponse } from "./workspaces";

/**
 * Progressive compose (ADR 0017): with `Accept: text/event-stream`, POST .../compose answers with
 * server-sent events, one JSON object per `data:` line, as the model writes its changes. The
 * client renders them as a draft (never saved) until `result`, which is validated and dry-run
 * exactly like the non-streaming response, and replaces the draft.
 */
export type DraftStreamEvent =
  /** What the server is doing (e.g. "Looking at github / list_repos…"). */
  | { type: "status"; message: string }
  /** A new attempt started (the previous one failed validation): drop the draft. */
  | { type: "reset" }
  /**
   * The page being generated (generated pages only, ADR 0011). Sent first, with its id, so the
   * client can open it right away; again with its title and route values once they're known.
   */
  | { type: "page"; page: DraftPageHeader; route?: Record<string, string> }
  /** A complete data source. */
  | { type: "source"; source: Source }
  /** A complete layout op, in order. */
  | { type: "layout"; op: LayoutOp }
  /** A new block's header as known so far; sent again when it grows. */
  | { type: "block"; block: DraftBlockHeader }
  /** A complete node of a new block. Its children may not have arrived yet. */
  | { type: "node"; blockId: string; id: string; node: BlockNode }
  /** Early data for a complete block, fetched while the model is still writing. */
  | { type: "view"; blockId: string; view: BlockView }
  | { type: "pageTitle"; title: string }
  /** CSS for classes the draft uses so far (append it). */
  | { type: "css"; css: string };

/** The stream ends with the validated result (the same as the non-streaming response) or an error. */
export type StreamEnd<R> = { type: "result"; result: R } | { type: "error"; error: string; details?: string[] };

export type ComposeStreamEvent = DraftStreamEvent | StreamEnd<ComposeResponse>;
/** POST .../pages with `Accept: text/event-stream` (ADR 0017). */
export type GeneratePageStreamEvent = DraftStreamEvent | StreamEnd<GeneratePageResponse>;

export type DraftPageHeader = {
  id: string;
  title?: string;
  /** Route params, once complete (their values are in the event's `route`). */
  params?: Record<string, PageParam>;
  intent?: { id: string; prompt: string };
};

export type DraftBlockHeader = {
  id: string;
  slot: string;
  order?: number;
  title?: string;
  frame?: BlockFrame;
  root?: string;
  toolbar?: string;
  inputs?: Record<string, string>;
};
