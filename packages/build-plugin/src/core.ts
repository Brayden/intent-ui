import { transformAsync, types as t, type NodePath, type PluginObj } from "@babel/core";

/*
 * Tags every JSX element in the host's own source with a stable id, so Intent UI can address any
 * part of a page (hide it, move it, put generated UI next to it) without the host annotating
 * anything. Elements written inside <Protected> are left untagged.
 *
 * Ids are "<file>:<Component>:<n>": the source file relative to the Vite root, the nearest
 * enclosing component (or function), and the element's position within it. They survive edits
 * elsewhere in the file and other files; a change inside the same component can shift <n>, which
 * is why patches also keep a fingerprint and are reported as orphaned rather than guessed.
 */

/** Options for every build tool's plugin. */
export type IntentUIPluginOptions = {
  /** Files to tag. Defaults to .jsx/.tsx outside node_modules. */
  include?: RegExp;
  exclude?: RegExp;
  /** Components whose JSX children aren't tagged. Defaults to ["Protected"]. */
  protectedComponents?: string[];
  /** The attribute to add. Must match the SDK's ID_ATTRIBUTE. */
  attribute?: string;
};

const PROTECTED_ATTRIBUTE = "data-iui-protected";

function elementName(name: t.JSXOpeningElement["name"]): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) return `${elementName(name.object as t.JSXOpeningElement["name"])}.${name.property.name}`;
  return `${name.namespace.name}:${name.name.name}`;
}

/** The name of a function, from its declaration or what it's assigned to; null for inline callbacks. */
function functionName(fn: NodePath): string | null {
  const node = fn.node;
  if ((t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) && node.id) return node.id.name;
  const parent = fn.parentPath;
  if (parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id)) return parent.node.id.name;
  if (parent?.isObjectProperty() && t.isIdentifier(parent.node.key)) return parent.node.key.name;
  if (parent?.isClassMethod() || parent?.isObjectMethod()) return t.isIdentifier(parent.node.key) ? parent.node.key.name : null;
  // forwardRef(function …) / memo(() => …) assigned to a variable.
  if (parent?.isCallExpression()) {
    const declarator = parent.parentPath;
    if (declarator?.isVariableDeclarator() && t.isIdentifier(declarator.node.id)) return declarator.node.id.name;
  }
  return null;
}

/** The component a JSX element belongs to: the nearest named function, skipping inline callbacks (e.g. a map). */
function enclosingName(path: NodePath): string {
  for (let fn = path.getFunctionParent(); fn; fn = fn.parentPath?.getFunctionParent() ?? null) {
    const name = functionName(fn);
    if (name) return name;
  }
  return "module";
}

function tagger(file: string, attribute: string, protectedComponents: Set<string>): PluginObj {
  const counters = new Map<string, number>();
  return {
    name: "intent-ui-tag",
    visitor: {
      JSXOpeningElement(path) {
        const name = elementName(path.node.name);
        if (name === "Fragment" || name.endsWith(".Fragment")) return;
        const attributes = path.node.attributes;
        const has = (attr: string) => attributes.some((a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === attr);
        if (has(attribute)) return;
        // Inside a protected subtree written in this file: <Protected> or an element marked protected.
        const insideProtected = path.findParent((parent) => {
          if (!parent.isJSXElement()) return false;
          const opening = parent.node.openingElement;
          const parentName = elementName(opening.name);
          return (
            protectedComponents.has(parentName.split(".").pop() ?? parentName) ||
            opening.attributes.some((a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === PROTECTED_ATTRIBUTE)
          );
        });
        if (insideProtected || protectedComponents.has(name) || has(PROTECTED_ATTRIBUTE)) return;

        const owner = enclosingName(path);
        const n = counters.get(owner) ?? 0;
        counters.set(owner, n + 1);
        attributes.push(t.jsxAttribute(t.jsxIdentifier(attribute), t.stringLiteral(`${file}:${owner}:${n}`)));
      },
    },
  };
}

/** Tags one module's JSX. Exported for tests and for non-Vite build tools. */
export async function tagSource(
  code: string,
  file: string,
  options: { attribute?: string; protectedComponents?: string[]; sourceMaps?: boolean } = {},
): Promise<{ code: string; map?: unknown } | null> {
  const result = await transformAsync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    sourceMaps: options.sourceMaps ?? true,
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [tagger(file, options.attribute ?? "data-iui-id", new Set(options.protectedComponents ?? ["Protected"]))],
  });
  return result?.code ? { code: result.code, map: result.map ?? undefined } : null;
}

export const DEFAULT_INCLUDE = /\.[jt]sx$/;
export const DEFAULT_EXCLUDE = /node_modules/;
