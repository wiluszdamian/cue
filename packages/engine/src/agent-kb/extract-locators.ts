import { AST_NODE_TYPES, parse, type TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * Pulling every locator out of a piece of test code, to answer the question the
 * knowledge base exists for: how many of these name something real? It reads
 * rather than runs, so it sees what was written even when the test would not run.
 */

export interface LocatorUse {
  /** `getByRole`, `getByTestId`, `locator`, … */
  readonly method: string;
  /** The role for `getByRole`, the id for `getByTestId`, the string for `locator`. */
  readonly value: string | undefined;
  /** The `name` option, where one was given. */
  readonly name: string | undefined;
  readonly line: number;
  /** Reconstructed, so it can be compared with what the knowledge base stores. */
  readonly locator: string;
}

const LOCATOR_METHODS = new Set([
  'getByRole',
  'getByTestId',
  'getByLabel',
  'getByPlaceholder',
  'getByText',
  'getByTitle',
  'getByAltText',
  'locator',
]);

function literal(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') return node.value;
  if (node?.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/** The `name:` property of an options object, when it is a plain string. */
function nameOption(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type !== AST_NODE_TYPES.ObjectExpression) return undefined;
  for (const property of node.properties) {
    if (property.type !== AST_NODE_TYPES.Property) continue;
    const key =
      property.key.type === AST_NODE_TYPES.Identifier
        ? property.key.name
        : property.key.type === AST_NODE_TYPES.Literal
          ? String(property.key.value)
          : undefined;
    if (key === 'name') return literal(property.value);
  }
  return undefined;
}

function walk(node: TSESTree.Node, visit: (node: TSESTree.Node) => void): void {
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === 'object' && typeof (child as TSESTree.Node).type === 'string') {
        walk(child as TSESTree.Node, visit);
      }
    }
  }
}

export function extractLocators(source: string): LocatorUse[] {
  let ast: TSESTree.Program;
  try {
    ast = parse(source, { loc: true, range: true, jsx: false });
  } catch {
    // No locators rather than an exception: a run reports the file, not aborts.
    return [];
  }

  const found: LocatorUse[] = [];

  walk(ast, (node) => {
    if (node.type !== AST_NODE_TYPES.CallExpression) return;
    const callee = node.callee;
    if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return;
    if (callee.property.type !== AST_NODE_TYPES.Identifier) return;

    const method = callee.property.name;
    if (!LOCATOR_METHODS.has(method)) return;

    const value = literal(node.arguments[0]);
    const name = nameOption(node.arguments[1]);

    found.push({
      method,
      value,
      name,
      line: node.loc.start.line,
      locator: render(method, value, name),
    });
  });

  return found;
}

function render(method: string, value: string | undefined, name: string | undefined): string {
  const quoted = value === undefined ? '…' : `'${value.replace(/'/g, "\\'")}'`;
  return name === undefined
    ? `${method}(${quoted})`
    : `${method}(${quoted}, { name: '${name.replace(/'/g, "\\'")}' })`;
}
