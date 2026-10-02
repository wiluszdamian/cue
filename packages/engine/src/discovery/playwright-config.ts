import { AST_NODE_TYPES, parse, type TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * What a `playwright.config.*` says, read from its text. The file is never run: a
 * config is code, and running somebody else's code to learn their test folder is a
 * poor trade. What cannot be read from the text (a `testDir` built from a variable,
 * projects spread in from elsewhere) is reported as not found, not guessed.
 */

export interface PlaywrightConfigFacts {
  /** The first literal `testDir`, as written. */
  readonly testDir?: string;
  /** The literal `name` of each project in a `projects` array. */
  readonly projects: readonly string[];
  /** The literal `baseURL`, if one is written down. Context only; never stored. */
  readonly baseURL?: string;
  /** The text could not be parsed at all. */
  readonly unreadable?: string;
}

function literal(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') return node.value;
  if (node?.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

function keyOf(property: TSESTree.Property): string | undefined {
  if (property.computed) return undefined;
  if (property.key.type === AST_NODE_TYPES.Identifier) return property.key.name;
  // Not computed and not a name, so a string or number literal key: `'testDir': …`.
  return String(property.key.value);
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

export function inspectPlaywrightConfig(text: string): PlaywrightConfigFacts {
  let ast: TSESTree.Program;
  try {
    ast = parse(text, { range: true, loc: false, jsx: false });
  } catch (error) {
    return {
      projects: [],
      unreadable:
        (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? 'parse error',
    };
  }

  let testDir: string | undefined;
  let baseURL: string | undefined;
  let projects: string[] | undefined;

  const visit = (node: TSESTree.Node): void => {
    if (node.type === AST_NODE_TYPES.Property) {
      const key = keyOf(node);
      if (key === 'testDir' && testDir === undefined) testDir = literal(node.value);
      else if (key === 'baseURL' && baseURL === undefined) baseURL = literal(node.value);
      else if (
        key === 'projects' &&
        projects === undefined &&
        node.value.type === AST_NODE_TYPES.ArrayExpression
      ) {
        projects = node.value.elements.flatMap((element) => {
          if (element?.type !== AST_NODE_TYPES.ObjectExpression) return [];
          const name = element.properties.find(
            (property): property is TSESTree.Property =>
              property.type === AST_NODE_TYPES.Property && keyOf(property) === 'name',
          );
          const value = literal(name?.value);
          return value === undefined ? [] : [value];
        });
      }
    }
    for (const child of children(node)) visit(child);
  };
  visit(ast);

  return {
    ...(testDir === undefined ? {} : { testDir }),
    projects: projects ?? [],
    ...(baseURL === undefined ? {} : { baseURL }),
  };
}
