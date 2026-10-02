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
  /** The `name` option, where one was given as a plain string. */
  readonly name: string | undefined;
  readonly line: number;
  /** Reconstructed, so it can be compared with what the knowledge base stores. */
  readonly locator: string;

  /** 1-based, like `line`. The range runs from the method name to the closing parenthesis. */
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  /** `{ exact: true }` was passed. */
  readonly exact: boolean;
  /**
   * Something was given that cannot be read without running the code: a variable, a
   * template with expressions, a regular expression, spread options. Nothing can be
   * decided about such a locator, and it is not the same as having no argument.
   */
  readonly dynamic: boolean;
  /** Called on something other than the page, so it narrows an element found elsewhere. */
  readonly chained: boolean;
  /** Offset of the call, to order it against `page.goto`. */
  readonly offset: number;
  /** Start offsets of the functions around it, innermost first. */
  readonly scopes: readonly number[];
}

export interface Navigation {
  /** The string passed to `goto`, as written (`/login`, or a full URL). */
  readonly target: string;
  readonly line: number;
  readonly offset: number;
  readonly scopes: readonly number[];
}

export interface TestSourceScan {
  readonly locators: LocatorUse[];
  readonly navigations: Navigation[];
  /** From a `// understudy-route: /login` comment near the top of the file. */
  readonly routeAnnotation: string | undefined;
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

const ANNOTATION = /^\s*(?:\/\/|\/?\*+)\s*understudy-route:\s*(\S+?)\s*(?:\*\/)?\s*$/m;

function literal(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') return node.value;
  if (node?.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

function keyName(property: TSESTree.Property): string | undefined {
  if (property.key.type === AST_NODE_TYPES.Identifier) return property.key.name;
  if (property.key.type === AST_NODE_TYPES.Literal) return String(property.key.value);
  return undefined;
}

interface Options {
  readonly name: string | undefined;
  readonly exact: boolean;
  /** Options were passed that cannot be read: a variable, a spread, a computed key. */
  readonly unreadable: boolean;
  /** A `name` was given, whether or not it could be read. */
  readonly hasName: boolean;
}

function readOptions(node: TSESTree.Node | undefined): Options {
  if (node === undefined)
    return { name: undefined, exact: false, unreadable: false, hasName: false };
  if (node.type !== AST_NODE_TYPES.ObjectExpression) {
    return { name: undefined, exact: false, unreadable: true, hasName: false };
  }

  let name: string | undefined;
  let exact = false;
  let unreadable = false;
  let hasName = false;
  for (const property of node.properties) {
    if (property.type !== AST_NODE_TYPES.Property || property.computed) {
      unreadable = true;
      continue;
    }
    const key = keyName(property);
    if (key === 'name') {
      hasName = true;
      name = literal(property.value);
    } else if (key === 'exact') {
      exact = property.value.type === AST_NODE_TYPES.Literal && property.value.value === true;
    }
  }
  return { name, exact, unreadable, hasName };
}

/** The receivers that are the page itself: `page`, `this.page`, `this.myPage`. */
function isPageLike(node: TSESTree.Node): boolean {
  const name =
    node.type === AST_NODE_TYPES.Identifier
      ? node.name
      : node.type === AST_NODE_TYPES.MemberExpression &&
          !node.computed &&
          node.property.type === AST_NODE_TYPES.Identifier
        ? node.property.name
        : undefined;
  return name !== undefined && /page$/i.test(name);
}

function isFunction(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function children(node: TSESTree.Node): TSESTree.Node[] {
  const found: TSESTree.Node[] = [];
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === 'object' && typeof (child as TSESTree.Node).type === 'string') {
        found.push(child as TSESTree.Node);
      }
    }
  }
  return found;
}

export function scanTestSource(source: string): TestSourceScan {
  const routeAnnotation = ANNOTATION.exec(source.slice(0, 4000))?.[1];

  let ast: TSESTree.Program;
  try {
    ast = parse(source, { loc: true, range: true, jsx: false });
  } catch {
    // No locators rather than an exception: a run reports the file, not aborts.
    return { locators: [], navigations: [], routeAnnotation };
  }

  const locators: LocatorUse[] = [];
  const navigations: Navigation[] = [];
  const scopes: number[] = [];

  const visit = (node: TSESTree.Node): void => {
    const entered = isFunction(node);
    if (entered) scopes.unshift(node.range[0]);

    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      !node.callee.computed &&
      node.callee.property.type === AST_NODE_TYPES.Identifier
    ) {
      const method = node.callee.property.name;
      const property = node.callee.property;

      if (LOCATOR_METHODS.has(method)) {
        const value = literal(node.arguments[0]);
        const options = readOptions(node.arguments[1]);
        const { name } = options;
        // A missing first argument is a different mistake from an unreadable one.
        const dynamic =
          (node.arguments[0] !== undefined && value === undefined) ||
          options.unreadable ||
          (options.hasName && name === undefined);

        locators.push({
          method,
          value,
          name,
          line: node.loc.start.line,
          locator: render(method, value, name),
          column: property.loc.start.column + 1,
          endLine: node.loc.end.line,
          endColumn: node.loc.end.column + 1,
          exact: options.exact,
          dynamic,
          chained: !isPageLike(node.callee.object),
          offset: node.range[0],
          scopes: [...scopes],
        });
      } else if (method === 'goto') {
        const target = literal(node.arguments[0]);
        if (target !== undefined) {
          navigations.push({
            target,
            line: node.loc.start.line,
            offset: node.range[0],
            scopes: [...scopes],
          });
        }
      }
    }

    for (const child of children(node)) visit(child);
    if (entered) scopes.shift();
  };
  visit(ast);

  return { locators, navigations, routeAnnotation };
}

export function extractLocators(source: string): LocatorUse[] {
  return scanTestSource(source).locators;
}

function render(method: string, value: string | undefined, name: string | undefined): string {
  const quoted = value === undefined ? '…' : `'${value.replace(/'/g, "\\'")}'`;
  return name === undefined
    ? `${method}(${quoted})`
    : `${method}(${quoted}, { name: '${name.replace(/'/g, "\\'")}' })`;
}
