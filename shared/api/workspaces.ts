import { z } from "zod";
import type { ComposeChanges } from "../spec/composeChanges";
import type { BlockView, Page, Workspace } from "../spec/workspace";
import { BlockContextSchema, type Template } from "./intents";

/** GET /api/workspaces */
export type WorkspaceSummary = { id: string; title: string; createdAt: string; updatedAt: string };

/** POST /api/workspaces — blank by default, or from a given spec (e.g. an example). */
export const CreateWorkspaceRequestSchema = z.object({
  title: z.string().min(1).max(120).default("Untitled workspace"),
  spec: z.unknown().optional(),
});
export type CreateWorkspaceRequest = z.input<typeof CreateWorkspaceRequestSchema>;

/** GET /api/workspaces/:id */
export type WorkspaceResponse = {
  id: string;
  spec: Workspace;
  version: number;
  css: string;
  views: Record<string, BlockView>;
  templates: Template[];
  aliases: Record<string, string>;
};

/** PUT /api/workspaces/:id — autosave. 409 with the current version if `baseVersion` is stale. */
export const SaveWorkspaceRequestSchema = z.object({
  spec: z.unknown(),
  baseVersion: z.number().int(),
  summary: z.string().max(300).default("Edited"),
});
export type SaveWorkspaceRequest = z.input<typeof SaveWorkspaceRequestSchema>;
export type SaveWorkspaceResponse = { version: number; css: string };

/** POST /api/workspaces/:id/data — run the page's sources and compute its views. */
/** Route values for pages with params (ADR 0011): read by sources and views as `$route`. */
export const RouteValuesSchema = z.record(z.string(), z.string()).default({});

export const RefreshRequestSchema = z.object({
  pageId: z.string(),
  route: RouteValuesSchema,
  /** Only these blocks (e.g. the ones that read a route value that just changed); default all. */
  blocks: z.array(z.string()).optional(),
});
export type RefreshResponse = { views: Record<string, BlockView> };

/** POST /api/workspaces/:id/templates — store a materialized or edited template. */
export const PutTemplateRequestSchema = z.object({
  template: z.unknown(),
  aliasKey: z.string().optional(),
});
export type PutTemplateResponse = { css: string };

/** POST /api/workspaces/:id/compose — build or change the page from a chat prompt. */
export const ComposeRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  pageId: z.string(),
  /** The page's current route values, for the dry run. */
  route: RouteValuesSchema,
  /** The client's latest spec (may include unsaved edits); validated like any save. */
  spec: z.unknown(),
});
export type ComposeRequest = z.input<typeof ComposeRequestSchema>;

export type ComposeResponse =
  | {
      status: "applied";
      summary: string;
      changes: ComposeChanges;
      /** Views from the server's dry run, so the result shows data immediately. */
      views: Record<string, BlockView>;
      /** Route values the dry run used (examples for new params): open the page with these if the URL has none. */
      route: Record<string, string>;
      css: string;
      attempts: number;
    }
  | { status: "declined"; reason: string };

/**
 * POST /api/workspaces/:id/pages — generate the page for a deferred intent with `open: "page"`
 * (ADR 0011). The page takes route params from the clicked item, so one page serves every item.
 */
export const GeneratePageRequestSchema = z.object({
  intent: z.object({ id: z.string().min(1), prompt: z.string().min(1).max(2000) }),
  /** The item the intent was clicked on (fills the new page's params). */
  item: z.unknown().optional(),
  /** The page and block it was clicked from. */
  from: z.object({ pageId: z.string(), block: BlockContextSchema.optional() }),
  /** The client's latest spec (may include unsaved edits); validated like any save. */
  spec: z.unknown(),
});
export type GeneratePageRequest = z.input<typeof GeneratePageRequestSchema>;

export type GeneratePageResponse =
  | {
      status: "applied";
      /** The new page (empty layout); then apply `changes` to it like a compose result. */
      page: Page;
      changes: ComposeChanges;
      /** The route values for the clicked item. */
      route: Record<string, string>;
      views: Record<string, BlockView>;
      css: string;
      summary: string;
      attempts: number;
    }
  | { status: "declined"; reason: string };
