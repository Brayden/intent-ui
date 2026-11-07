/*
 * CSS compiled by the server for generated UI (ADR 0006). Each response carries the CSS for
 * the classes it uses; it's added once (deduplicated) after the app's stylesheet.
 *
 * Class rules the app stylesheet already has are dropped first. Within a cascade layer, later
 * rules win, so a re-emitted plain utility (say `.items-end`) would otherwise override the app's
 * responsive variant of it (Kumo's `sm:items-center`) and break Kumo components on desktop.
 * Classes new to the page can't clash that way: Kumo's own classes are all in the app sheet.
 */

const injected = new Set<string>();

/** Adds a chunk of compiled spec CSS to the document, once. Call before rendering the change. */
export function injectSpecCss(css: string | undefined): void {
  if (!css || injected.has(css)) return;
  injected.add(css);
  const style = document.createElement("style");
  style.dataset.intentSpec = "";
  style.textContent = withoutAppRules(css);
  document.head.append(style);
}

function withoutAppRules(css: string): string {
  if (typeof CSSStyleSheet === "undefined") return css;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    prune(sheet, appClassSelectors());
    return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
  } catch {
    return css; // unparsable here: inject as-is rather than lose styles
  }
}

/** Class selectors (`.foo`) defined by the app's own stylesheets. Theme rules (`:root`) are kept. */
function appClassSelectors(): Set<string> {
  const selectors = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    if ((sheet.ownerNode as HTMLElement | null)?.dataset?.intentSpec !== undefined) continue;
    try {
      collect(sheet.cssRules, selectors);
    } catch {
      // cross-origin sheet: not ours
    }
  }
  return selectors;
}

function collect(rules: CSSRuleList, out: Set<string>): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      if (rule.selectorText.startsWith(".")) out.add(rule.selectorText);
    } else if ("cssRules" in rule) {
      collect((rule as CSSGroupingRule).cssRules, out);
    }
  }
}

function prune(parent: CSSStyleSheet | CSSGroupingRule, app: Set<string>): void {
  for (let i = parent.cssRules.length - 1; i >= 0; i--) {
    const rule = parent.cssRules[i];
    if (rule instanceof CSSStyleRule) {
      if (app.has(rule.selectorText)) parent.deleteRule(i);
    } else if ("cssRules" in rule) {
      prune(rule as CSSGroupingRule, app);
    }
  }
}
