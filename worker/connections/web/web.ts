import { z } from "zod";
import { HttpError } from "../../lib/http";
import type { Connection } from "../types";
import { extractItems, pageText, type ExtractRecipe } from "./extract";
import { safeUrl } from "./guard";

/*
 * The web as a read-only connection (ADR 0009). Sources that use `web/fetch` with a JSON URL or
 * an extraction recipe are deterministic: refreshing them needs no model.
 */

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 3_000_000;
const MAX_TEXT = 12_000;

const FieldSpecSchema = z.union([z.string(), z.object({ selector: z.string(), attr: z.string().optional() })]);
export const FetchArgs = z.object({
  url: z.string().describe("https URL to fetch"),
  extract: z
    .object({
      items: z.string().min(1).describe("CSS selector matching each row, e.g. 'ol.chart > li' or 'table tbody tr'"),
      fields: z.record(z.string(), FieldSpecSchema).describe("field → CSS selector within the row ('' = the row itself), or { selector, attr } to read an attribute like href"),
    })
    .optional()
    .describe("For HTML: turn the page into rows. Omit to get the page's title and text (for inspection), or for JSON URLs."),
  maxItems: z.number().int().positive().max(1000).default(200),
});

async function get(url: URL): Promise<Response> {
  const response = await fetch(url, {
    headers: { "user-agent": "IntentUI/0.1 (data fetcher)", accept: "application/json, text/html;q=0.9, */*;q=0.5" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new HttpError(502, `${url.hostname} returned ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new HttpError(502, `${url.hostname} response is too large`);
  safeUrl(response.url || url.toString()); // redirects must stay safe too
  return response;
}

async function fetchTool(args: unknown) {
  const parsed = FetchArgs.safeParse(args);
  if (!parsed.success) throw new HttpError(400, "Invalid fetch arguments", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const { url: input, extract, maxItems } = parsed.data;
  const url = safeUrl(input);
  const response = await get(url);
  const type = response.headers.get("content-type") ?? "";

  if (type.includes("json")) {
    const body = await response.text();
    if (body.length > MAX_BYTES) throw new HttpError(502, `${url.hostname} response is too large`);
    return { url: url.toString(), contentType: "json", json: JSON.parse(body) as unknown };
  }
  if (extract) {
    const items = await extractItems(response, extract as ExtractRecipe, maxItems);
    return { url: url.toString(), contentType: "html", count: items.length, items };
  }
  return { url: url.toString(), contentType: "html", ...(await pageText(response, MAX_TEXT)) };
}

export const web: Connection = {
  id: "web",
  name: "Web",
  tools: [
    {
      connection: "web",
      name: "fetch",
      description:
        "Fetch a public https page or JSON API. JSON → { json }. HTML with `extract` → { items: [ { field: text } ], count }. HTML without `extract` → { title, text } for reading.",
      readOnly: true,
      inputSchema: z.toJSONSchema(FetchArgs, { io: "input" }),
    },
  ],
  async call(tool, args) {
    if (tool !== "fetch") throw new HttpError(404, `Unknown tool ${tool}`);
    return fetchTool(args);
  },
};
