/*
 * HTML → rows with CSS selectors, using the Workers runtime's streaming HTMLRewriter
 * (ADR 0009 tier 1). A recipe is { items: "<selector for each row>", fields: { name: selector } }.
 * Field selectors are relative to the item; "" means the item itself. `attr` reads an attribute
 * (e.g. href) instead of text. Runs only in the Workers runtime.
 */

export type FieldSpec = string | { selector: string; attr?: string };
export type ExtractRecipe = { items: string; fields: Record<string, FieldSpec> };

const MAX_FIELD_CHARS = 2000;
const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** Extracts rows from an HTML response using an extraction recipe. */
export async function extractItems(response: Response, recipe: ExtractRecipe, maxItems: number): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  const fieldText = (name: string, text: string) => {
    if (!current) return;
    const next = (current[name] ?? "") + text;
    current[name] = next.length > MAX_FIELD_CHARS ? next.slice(0, MAX_FIELD_CHARS) : next;
  };

  let rewriter = new HTMLRewriter().on(recipe.items, {
    element() {
      if (rows.length >= maxItems) {
        current = null;
        return;
      }
      current = {};
      rows.push(current);
    },
  });

  for (const [name, spec] of Object.entries(recipe.fields)) {
    const { selector, attr } = typeof spec === "string" ? { selector: spec, attr: undefined } : spec;
    const target = selector.trim() ? `${recipe.items} ${selector}` : recipe.items;
    rewriter = rewriter.on(target, {
      element(element) {
        if (attr && current && current[name] === undefined) current[name] = element.getAttribute(attr) ?? "";
      },
      text(chunk) {
        if (!attr) fieldText(name, chunk.text);
      },
    });
  }

  await rewriter.transform(response).arrayBuffer();
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, clean(value)])));
}

/** Readable text and title of an HTML page (for the model to inspect), skipping scripts and styles. */
export async function pageText(response: Response, maxChars: number): Promise<{ title: string; text: string }> {
  let title = "";
  let text = "";
  let skipping = 0;
  await new HTMLRewriter()
    .on("title", { text: (chunk) => void (title += chunk.text) })
    .on("script, style, noscript, svg", {
      element(element) {
        skipping++;
        element.onEndTag(() => void skipping--);
      },
    })
    .on("body *", {
      text(chunk) {
        if (skipping === 0 && text.length < maxChars) text += chunk.text + (chunk.lastInTextNode ? " " : "");
      },
    })
    .transform(response)
    .arrayBuffer();
  return { title: clean(title), text: clean(text).slice(0, maxChars) };
}
