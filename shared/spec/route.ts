import type { ResearchSource } from "./sources";
import type { Page } from "./workspace";

/** Values for a page's route params, as they appear in its URL. */
export type RouteValues = Record<string, string>;

/** The URL of a page in a workspace, e.g. `/w/abc/artist?artist=Adele`. */
export function pagePath(workspaceId: string, pageId: string, values: RouteValues = {}): string {
  const query = new URLSearchParams(values).toString();
  return `/w/${encodeURIComponent(workspaceId)}/${encodeURIComponent(pageId)}${query ? `?${query}` : ""}`;
}

/** Route values for opening `page` on `item` (each param's `from` field). Missing fields are listed. */
export function routeFromItem(page: Page, item: unknown): { values: RouteValues; missing: string[] } {
  const record = item !== null && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const values: RouteValues = {};
  const missing: string[] = [];
  for (const [name, param] of Object.entries(page.params)) {
    const value = param.from ? record[param.from] : undefined;
    if (value !== undefined && value !== null && value !== "") values[name] = String(value);
    else if (!param.optional) missing.push(name);
  }
  return { values, missing };
}

/** Required params the route doesn't give (optional ones may be absent). */
export function missingParams(page: Page, values: RouteValues): string[] {
  return Object.entries(page.params)
    .filter(([name, param]) => !param.optional && !values[name])
    .map(([name]) => name);
}

/** Only the page's declared params, so stray query strings never reach data sources. */
export function pickRoute(page: Page | undefined, values: RouteValues): RouteValues {
  if (!page) return {};
  return Object.fromEntries(Object.keys(page.params).flatMap((name) => (values[name] === undefined ? [] : [[name, values[name]]])));
}

/** Route values for a dry run: the current values, else each param's example. Missing ones are listed. */
export function dryRunRoute(page: Page, current: RouteValues = {}): { values: RouteValues; missing: string[] } {
  const values: RouteValues = {};
  const missing: string[] = [];
  for (const [name, param] of Object.entries(page.params)) {
    const value = current[name] ?? param.example;
    if (value) values[name] = value;
    else if (!param.optional) missing.push(name);
  }
  return { values, missing };
}

/** Fills `{name}` placeholders with route values. */
export function fillPlaceholders(text: string, values: RouteValues): string {
  return text.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name: string) => values[name] ?? match);
}

/** The values a parameterized research source needs from the route, or null if any is missing. */
export function researchValues(source: ResearchSource, route: RouteValues): RouteValues | null {
  const values: RouteValues = {};
  for (const name of source.params) {
    if (!route[name]) return null;
    values[name] = route[name];
  }
  return values;
}

export const sameValues = (a: RouteValues = {}, b: RouteValues = {}) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
