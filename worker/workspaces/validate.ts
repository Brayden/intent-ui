import { TemplateSchema, type Template } from "../../shared/api";
import { validateBlockTree } from "../../shared/catalog";
import { describeIssues, documentIssues, validateLayoutTree, WorkspaceSchema, type Workspace } from "../../shared/spec";
import { allClasses, collectClasses, styleIssues } from "../styles/collect";
import type { StyleEngine } from "../styles/engine";

/**
 * Validates a whole workspace before it's stored: schema, every layout and block tree, cross
 * references (RFC 0003 §12), and the brand policy for every class. Returns the parsed spec and its compiled CSS, or issues.
 */
export async function checkWorkspace(
  input: unknown,
  templates: Template[],
  styles: StyleEngine,
): Promise<{ spec: Workspace; css: string; issues: [] } | { issues: string[] }> {
  const parsed = WorkspaceSchema.safeParse(input);
  if (!parsed.success) return { issues: describeIssues(parsed.error.issues) };
  const spec = parsed.data;

  const issues: string[] = [];
  for (const page of Object.values(spec.pages)) issues.push(...validateLayoutTree(page.layout).map((i) => `page "${page.id}": ${i}`));
  for (const block of Object.values(spec.blocks)) {
    issues.push(...validateBlockTree(block).map((i) => `block "${block.id}": ${i}`));
  }
  issues.push(...documentIssues(spec));
  const usage = collectClasses([...Object.values(spec.pages).map((page) => page.layout), ...Object.values(spec.blocks), ...templates]);
  issues.push(...(await styleIssues(styles, usage)));
  if (issues.length > 0) return { issues };
  return { spec, css: await styles.css(allClasses(usage)), issues: [] };
}

/** Parses a template for storage. */
export function parseTemplate(input: unknown): Template | { issues: string[] } {
  const parsed = TemplateSchema.safeParse(input);
  return parsed.success ? parsed.data : { issues: describeIssues(parsed.error.issues) };
}
