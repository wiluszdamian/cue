import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * Second-pass checks for what an esquery selector cannot see: a comment above the
 * node, a sibling argument, the tag list. Shared verbatim by the engine and the
 * plugin, so the two cannot drift. Returns `true` when the match is a violation.
 */

export interface RefineContext {
  readonly filePath: string;
  readonly text: string;
  readonly comments: readonly TSESTree.Comment[];
  /** Tag names from rules/tags.yaml, e.g. `['@smoke', '@api']`. */
  readonly canonicalTags: readonly string[];
}

export type Refinement = (node: TSESTree.Node, ctx: RefineContext) => boolean;

// Playwright's own addressing syntax, not raw CSS or XPath — out of scope here.
const PLAYWRIGHT_ENGINE_PREFIX =
  /^(css|xpath|text|id|data-testid|role|alt|title|label|placeholder|internal:[a-z-]+|_react|_vue)=/;

function stringLiteralValue(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') return node.value;
  if (node?.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/**
 * `page.locator(sel)` is left alone, because a rule that guesses gets disabled. An
 * explicit `css=` prefix is a reviewable choice, not the accident this catches.
 */
export const firstArgumentIsRawSelector: Refinement = (node) => {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const value = stringLiteralValue(node.arguments[0]);
  if (value === undefined) return false;
  if (PLAYWRIGHT_ENGINE_PREFIX.test(value)) return false;
  return !takesSelectorOnlyOnPage(node) || hasPageReceiver(node);
};

/**
 * `page.fill('#email', value)` addresses by CSS; `field.fill('a@b.c')` passes a
 * value, and the two are the same AST shape. The receiver is what decides.
 */
function takesSelectorOnlyOnPage(node: TSESTree.CallExpression): boolean {
  const property =
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.property.type === AST_NODE_TYPES.Identifier
      ? node.callee.property.name
      : undefined;
  return property !== undefined && property !== 'locator' && property !== 'waitForSelector';
}

/** `page.x(...)`, `frame.x(...)`, `this.page.x(...)`. */
function hasPageReceiver(node: TSESTree.CallExpression): boolean {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  const receiver = node.callee.object;

  if (receiver.type === AST_NODE_TYPES.Identifier) return isPageName(receiver.name);
  return (
    receiver.type === AST_NODE_TYPES.MemberExpression &&
    receiver.property.type === AST_NODE_TYPES.Identifier &&
    isPageName(receiver.property.name)
  );
}

function isPageName(name: string): boolean {
  return name === 'page' || name === 'frame';
}

/** `test.skip('title', { tag }, fn)` / `test.skip('title', fn)`: no reason, the second argument is the body. */
function isDeclarationBody(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ObjectExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

const ISSUE_REFERENCE = /([A-Z][A-Z0-9]+-\d+)|(#\d+)|(https?:\/\/\S+)/;

/** Acceptable when conditional — `test.skip(cond, 'why')` — or ticketed on or above the line. */
export const skipLacksIssueReference: Refinement = (node, ctx) => {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;

  // `test.skip(condition, 'why')` states its reason in the call itself.
  if (node.arguments.length >= 2) {
    // A reason that is only known at runtime (`${x}`, a constant, `r ?? ''`, `a + b`)
    // still counts; only a literally empty one does not.
    const reason = node.arguments[1];
    const literal = stringLiteralValue(reason);
    if (
      literal === undefined
        ? reason !== undefined && !isDeclarationBody(reason)
        : literal.trim().length > 0
    ) {
      return false;
    }
  }

  const line = node.loc.start.line;
  const annotated = ctx.comments.some((comment) => {
    const onOrAbove = comment.loc.end.line === line || comment.loc.end.line === line - 1;
    return onOrAbove && ISSUE_REFERENCE.test(comment.value);
  });
  return !annotated;
};

/** Both the `tag` option and an inline `@tag` count: the rule is about filterability. */
export const testLacksCanonicalTag: Refinement = (node, ctx) => {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;

  const title = stringLiteralValue(node.arguments[0]);
  if (title === undefined) return false; // not a literal test declaration
  if (ctx.canonicalTags.some((tag) => hasTagToken(title, tag))) return false;

  const options = node.arguments[1];
  if (options?.type !== AST_NODE_TYPES.ObjectExpression) return true;

  const tagProperty = options.properties.find(
    (p): p is TSESTree.Property =>
      p.type === AST_NODE_TYPES.Property &&
      ((p.key.type === AST_NODE_TYPES.Identifier && p.key.name === 'tag') ||
        (p.key.type === AST_NODE_TYPES.Literal && p.key.value === 'tag')),
  );
  if (!tagProperty) return true;

  const declared =
    tagProperty.value.type === AST_NODE_TYPES.ArrayExpression
      ? tagProperty.value.elements.map((e) => stringLiteralValue(e ?? undefined))
      : [stringLiteralValue(tagProperty.value)];

  return !declared.some((tag) => tag !== undefined && ctx.canonicalTags.includes(tag));
};

/** `@smoke` must not match inside `@smoketest`. */
function hasTagToken(haystack: string, tag: string): boolean {
  const index = haystack.indexOf(tag);
  if (index === -1) return false;
  const next = haystack[index + tag.length];
  return next === undefined || !/[a-zA-Z0-9-]/.test(next);
}

export const REFINEMENTS: Readonly<Record<string, Refinement>> = Object.freeze({
  'first-argument-is-raw-selector': firstArgumentIsRawSelector,
  'skip-lacks-issue-reference': skipLacksIssueReference,
  'test-lacks-canonical-tag': testLacksCanonicalTag,
});

export function getRefinement(name: string): Refinement {
  const refinement = REFINEMENTS[name];
  if (!refinement) {
    throw new Error(
      `unknown refinement "${name}". Register it in packages/engine/src/detectors/refinements.ts ` +
        `or drop the refine field from the rule.`,
    );
  }
  return refinement;
}
