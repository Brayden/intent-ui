import { z } from "zod";
import { CATALOG } from "./catalog";

/**
 * Describes the catalog for the model: each component's purpose, nesting rules, and props
 * as JSON Schema. Generated from the same specs the validator uses, so they can't drift.
 */
export function describeCatalog(filter?: (type: string) => boolean): string {
  return Object.values(CATALOG)
    .filter((spec) => !filter || filter(spec.type))
    .map((spec) => {
      const rules = [
        spec.parent && `only inside ${[spec.parent].flat().join(" or ")}`,
        typeof spec.children === "object" ? `children: ${spec.children.only} only` : spec.children === "any" ? "children: any" : "no children",
        spec.overlay && "can be an overlay root",
        ...Object.entries(spec.childLimits ?? {}).map(([type, max]) => `at most ${max} ${type} child${max === 1 ? "" : "ren"}`),
      ].filter(Boolean);
      const action = spec.action ? `Action: ${spec.action}` : "Action: none (never fires an action)";
      const schema = JSON.stringify(z.toJSONSchema(spec.props, { io: "input", unrepresentable: "any" }));
      return `### ${spec.type}\n${spec.description}\nRules: ${rules.join("; ")}\n${action}\nProps (JSON Schema): ${schema}`;
    })
    .join("\n\n");
}
