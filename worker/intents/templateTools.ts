import { z } from "zod";
import type { MaterializeRequest, Template, ToolInfo } from "../../shared/api";
import { validateBlockTree, lintDialogActions } from "../../shared/catalog";
import { BlockTreeSchema, describeIssues, isTemplateCompatible, templateRequirements } from "../../shared/spec";
import type { ToolDefinition } from "../llm/anthropic";
import { validateActions } from "./validateActions";
import { allClasses, collectClasses, styleIssues } from "../styles/collect";
import type { StyleEngine } from "../styles/engine";

/* The two ways the model can answer a materialize request, and how each is checked. */

const EmitInputSchema = BlockTreeSchema.extend({
  summary: z.string().min(1).describe("One sentence: what this UI does, e.g. 'Form to edit a person's name and job title.'"),
});
const ReuseInputSchema = z.object({
  templateId: z.string(),
  reason: z.string().describe("One sentence: why this template serves the intent."),
});

const jsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;

export const EMIT_TOOL: ToolDefinition = {
  name: "emit_template",
  description: "Emit a NEW overlay UI template as a flat tree of catalog components, with a one-sentence summary.",
  input_schema: jsonSchema(EmitInputSchema),
};

export const REUSE_TOOL: ToolDefinition = {
  name: "reuse_template",
  description: "Reuse an EXISTING template (from the list in the system prompt) that already serves this intent.",
  input_schema: jsonSchema(ReuseInputSchema),
};

export type ToolOutcome =
  | { ok: true; template: Template; reused: boolean; reason?: string; css: string }
  | { ok: false; issues: string[] };

const zodIssues = (error: z.ZodError) => describeIssues(error.issues);

/** Validates an emit_template call (incl. brand policy) and builds the template with its CSS. */
export async function handleEmit(
  input: unknown,
  request: MaterializeRequest,
  tools: ToolInfo[],
  styles: StyleEngine,
): Promise<ToolOutcome> {
  const parsed = EmitInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) };
  const { summary, ...tree } = parsed.data;
  const issues = [...validateBlockTree(tree, { overlay: true }), ...lintDialogActions(tree), ...validateActions(tree, tools)];
  if (issues.length > 0) return { ok: false, issues };
  const usage = collectClasses([tree]);
  const brand = await styleIssues(styles, usage);
  if (brand.length > 0) return { ok: false, issues: brand };
  const template: Template = {
    ...tree,
    id: crypto.randomUUID(),
    intentId: request.intent.id,
    prompt: request.intent.prompt,
    summary,
    ...templateRequirements(tree),
  };
  return { ok: true, template, reused: false, css: await styles.css(allClasses(usage)) };
}

/** Validates a reuse_template call: the template must be a candidate and fit this item. */
export async function handleReuse(
  input: unknown,
  request: MaterializeRequest,
  tools: ToolInfo[],
  styles: StyleEngine,
): Promise<ToolOutcome> {
  const parsed = ReuseInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) };
  const template = request.candidates.find((candidate) => candidate.id === parsed.data.templateId);
  if (!template) return { ok: false, issues: [`No candidate template with id "${parsed.data.templateId}"`] };
  const available = new Set(tools.map((tool) => `${tool.connection}/${tool.name}`));
  if (!isTemplateCompatible(templateRequirements(template), request.item, available)) {
    return { ok: false, issues: [`Template "${template.id}" needs item fields or tools that aren't available here`] };
  }
  const css = await styles.css(allClasses(collectClasses([template])));
  return { ok: true, template, reused: true, reason: parsed.data.reason, css };
}
