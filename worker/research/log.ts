import type { ContentBlock } from "../llm/anthropic";

/** Canonical form for comparing URLs: no hash, no trailing slash. */
const canonical = (url: string) => url.replace(/#.*$/, "").replace(/\/$/, "");

/**
 * Every page the model actually saw during one request: web search results and fetched URLs.
 * Citations must come from here, so the model can't cite pages it never looked at (ADR 0009).
 */
export class ResearchLog {
  private readonly seen = new Set<string>();

  add(url: string): void {
    this.seen.add(canonical(url));
  }

  /** Collects result URLs from web_search_tool_result blocks in a model response. */
  collect(content: ContentBlock[]): void {
    for (const block of content) {
      if (block.type !== "web_search_tool_result") continue;
      const results = (block as { content?: unknown }).content;
      if (!Array.isArray(results)) continue;
      for (const result of results) {
        const url = (result as { url?: unknown }).url;
        if (typeof url === "string") this.add(url);
      }
    }
  }

  /** Citations that weren't searched or fetched in this request. */
  unseen(citations: string[]): string[] {
    return citations.filter((url) => !this.seen.has(canonical(url)));
  }

  get size(): number {
    return this.seen.size;
  }
}
