import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/typescript-estree';
import type { Fix } from '../diagnostic.js';

/**
 * Autofixes, keyed by rule id.
 *
 * A fix has to be safe enough to apply unattended, which in practice means a
 * rename or a wrapper — never a rewrite that changes what the test asserts.
 * `no-hard-waits` has no fixer for exactly that reason: only the author knows
 * which condition the sleep was standing in for.
 *
 * `validateRules` fails if a rule sets `autofix: true` and no fixer is
 * registered here, so the two cannot drift apart.
 */

export type Fixer = (node: TSESTree.Node) => Fix | undefined;

/** `z.object({...})` -> `z.strictObject({...})`, touching only the property name. */
export const strictZodObjects: Fixer = (node) => {
  if (node.type !== AST_NODE_TYPES.CallExpression) return undefined;
  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return undefined;
  if (callee.property.type !== AST_NODE_TYPES.Identifier || callee.property.name !== 'object') {
    return undefined;
  }

  return {
    range: [callee.property.range[0], callee.property.range[1]],
    text: 'strictObject',
    description: 'replace z.object with z.strictObject',
  };
};

export const FIXERS: Readonly<Record<string, Fixer>> = Object.freeze({
  'strict-zod-objects': strictZodObjects,
});

export function getFixer(ruleId: string): Fixer | undefined {
  return FIXERS[ruleId];
}
