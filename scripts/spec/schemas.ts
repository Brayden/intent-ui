/**
 * Generates the published IAP JSON Schemas and the Kumo catalog from the Zod sources of truth
 * (RFC 0003 Appendix A). `npm run spec:schemas` writes them; `-- --check` fails if they're stale.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { ChangeOpSchema, ChangeSchema, IAP_VERSION, IapDocumentSchema, TemplateSchema } from "../../shared/api";
import { CATALOG } from "../../shared/catalog";
import {
  ActionSchema,
  BlockFrameSchema,
  BlockNodeSchema,
  BlockOpSchema,
  BlockSchema,
  ComponentNodeSchema,
  DynamicValueSchema,
  ExprSchema,
  FieldMetaSchema,
  GridTemplateSchema,
  HtmlNodeSchema,
  LayoutNodeSchema,
  LayoutOpSchema,
  LayoutTreeSchema,
  LocalSourceSchema,
  PageParamSchema,
  PageSchema,
  PathRefSchema,
  ProvenanceSchema,
  ResearchSourceSchema,
  SlotNodeSchema,
  SourceSchema,
  ToolSourceSchema,
  VisibilityConditionSchema,
  WorkspaceSchema,
} from "../../shared/spec";

const ROOT = resolve(import.meta.dirname, "../..");
const BASE = "https://intent-ui.dev/spec/" + IAP_VERSION;
const check = process.argv.includes("--check");

/** Named definitions, so the published schemas read like the RFC (`#/$defs/Page`, not `__schema3`). */
const names = z.registry<{ id: string }>();
const named: Array<[z.ZodType, string]> = [
  [WorkspaceSchema, "Spec"],
  [PageSchema, "Page"],
  [PageParamSchema, "PageParam"],
  [LayoutTreeSchema, "LayoutTree"],
  [LayoutNodeSchema, "LayoutNode"],
  [SlotNodeSchema, "SlotNode"],
  [HtmlNodeSchema, "HtmlNode"],
  [GridTemplateSchema, "GridTemplate"],
  [BlockSchema, "Block"],
  [BlockFrameSchema, "BlockFrame"],
  [FieldMetaSchema, "FieldMeta"],
  [BlockNodeSchema, "BlockNode"],
  [ComponentNodeSchema, "ComponentNode"],
  [ActionSchema, "Action"],
  [VisibilityConditionSchema, "VisibilityCondition"],
  [DynamicValueSchema, "DynamicValue"],
  [PathRefSchema, "PathRef"],
  [ExprSchema, "Expr"],
  [SourceSchema, "Source"],
  [ToolSourceSchema, "ToolSource"],
  [LocalSourceSchema, "LocalSource"],
  [ResearchSourceSchema, "ResearchSource"],
  [ProvenanceSchema, "Provenance"],
  [TemplateSchema, "Template"],
  [LayoutOpSchema, "LayoutOp"],
  [BlockOpSchema, "BlockOp"],
  [ChangeOpSchema, "ChangeOp"],
];
for (const [schema, id] of named) names.add(schema, { id });

const jsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: "input", unrepresentable: "any", target: "draft-2020-12", metadata: names, reused: "inline" }) as Record<string, unknown>;

function catalogDocument() {
  const components = Object.fromEntries(
    Object.values(CATALOG)
      .sort((a, b) => a.type.localeCompare(b.type))
      .map((spec) => {
        const { $schema: _schema, ...props } = jsonSchema(spec.props);
        return [
          spec.type,
          {
            description: spec.description,
            props,
            children: spec.children === undefined ? "none" : typeof spec.children === "string" ? spec.children : [spec.children.only],
            ...(spec.parent ? { parent: spec.parent } : {}),
            ...(spec.childLimits ? { childLimits: spec.childLimits } : {}),
            ...(spec.action ? { action: spec.action } : {}),
            ...(spec.overlay ? { overlay: true } : {}),
          },
        ];
      }),
  );
  return { $schema: `${BASE}/catalog.schema.json`, id: "kumo", version: "2.17", components };
}

const catalogSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `${BASE}/catalog.schema.json`,
  title: "IAP catalog",
  description: "A library-neutral list of component types (RFC 0003 §7.2).",
  type: "object",
  required: ["id", "version", "components"],
  properties: {
    id: { type: "string" },
    version: { type: "string" },
    components: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: ["description", "props", "children"],
        properties: {
          description: { type: "string" },
          props: { type: "object", description: "JSON Schema for the node's props" },
          children: { oneOf: [{ enum: ["none", "any"] }, { type: "array", items: { type: "string" } }] },
          parent: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
          childLimits: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
          action: { type: "string", description: "Present iff the component fires its node's action; says when." },
          overlay: { type: "boolean" },
        },
      },
    },
  },
};

const outputs: Record<string, unknown> = {
  "docs/spec/schema/document.schema.json": {
    ...jsonSchema(IapDocumentSchema),
    $id: `${BASE}/document.schema.json`,
    title: "IAP document",
    description: "A persisted Intents and Persistence document (RFC 0003 §3).",
  },
  "docs/spec/schema/change.schema.json": {
    ...jsonSchema(ChangeSchema),
    $id: `${BASE}/change.schema.json`,
    title: "IAP change",
    description: "An edit to an IAP document (RFC 0003 §11.3).",
  },
  "docs/spec/schema/catalog.schema.json": catalogSchema,
  "docs/spec/catalogs/kumo-2.17.json": catalogDocument(),
};

let stale = 0;
for (const [path, value] of Object.entries(outputs)) {
  const file = resolve(ROOT, path);
  const text = JSON.stringify(value, null, 2) + "\n";
  if (check) {
    let current = "";
    try {
      current = readFileSync(file, "utf8");
    } catch {}
    if (current !== text) {
      stale++;
      console.error(`stale: ${path}`);
    }
  } else {
    writeFileSync(file, text);
    console.log(`wrote ${path}`);
  }
}
if (stale > 0) {
  console.error(`${stale} generated file(s) are out of date; run npm run spec:schemas`);
  process.exit(1);
}
