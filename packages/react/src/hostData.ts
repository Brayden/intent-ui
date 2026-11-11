import type { HostData, HostElement } from "../../../shared/api";

const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

/** Reads an element's content as data: a table's rows, a list's items, or its text. Live, cheap. */
export function extractHostData(element: Element): HostData {
  const table = element.matches("table") ? element : element.querySelector("table");
  if (table) {
    const headerCells = [...table.querySelectorAll("thead th")];
    const bodyRows = [...table.querySelectorAll("tbody tr")];
    const firstRow = table.querySelector("tr");
    const columns = (headerCells.length > 0 ? headerCells : [...(firstRow?.children ?? [])]).map((cell, i) => clean(cell.textContent) || `Column ${i + 1}`);
    const rows = (bodyRows.length > 0 ? bodyRows : [...table.querySelectorAll("tr")].slice(1)).map((row) =>
      Object.fromEntries([...row.children].map((cell, i) => [columns[i] ?? `Column ${i + 1}`, clean(cell.textContent)])),
    );
    return { kind: "table", columns, rows };
  }
  const list = element.matches("ul, ol") ? element : element.querySelector("ul, ol");
  if (list) return { kind: "list", items: [...list.querySelectorAll(":scope > li")].map((li) => clean(li.textContent)) };
  return { kind: "text", text: clean((element as HTMLElement).innerText ?? element.textContent).slice(0, 4000) };
}

export function describeHostElement(element: Element, id: string): HostElement {
  return {
    id,
    tag: element.tagName.toLowerCase(),
    text: clean((element as HTMLElement).innerText ?? element.textContent).slice(0, 4000),
    data: extractHostData(element),
  };
}

/** A short label for the prompt, e.g. "table (4 rows)" or "div “Getting started…”". */
export function hostElementLabel(element: Element): string {
  const data = extractHostData(element);
  const tag = element.tagName.toLowerCase();
  if (data.kind === "table") return `Table (${data.rows.length} rows)`;
  if (data.kind === "list") return `List (${data.items.length} items)`;
  const text = data.text.slice(0, 40);
  return text ? `${tag} “${text}${data.text.length > 40 ? "…" : ""}”` : tag;
}
