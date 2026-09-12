import { visitorKeys } from '@typescript-eslint/visitor-keys';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import esqueryModule from 'esquery';

/**
 * esquery is typed against `@types/estree`, which knows nothing about the
 * TypeScript nodes several selectors target. The mismatch is contained here so
 * the rest of the engine speaks TSESTree throughout.
 *
 * `visitorKeys` is not optional in practice: estraverse's `fallback: 'iteration'`
 * applies only to node types it does not recognise, and it recognises
 * `Identifier` with ESTree's keys. Without the TypeScript table, `const x: any`
 * is never visited while `x as any` is — and a rule that catches half its
 * violations is worse than one that catches none, because the clean run reads as
 * a guarantee.
 */

/** Opaque compiled selector. Only ever produced by `parseSelector`. */
export interface CompiledSelector {
  readonly __brand: 'esquery-selector';
}

interface EsqueryOptions {
  readonly visitorKeys: Readonly<Record<string, readonly string[]>>;
  readonly fallback: (node: object) => string[];
}

interface EsqueryApi {
  parse(selector: string): unknown;
  match(ast: unknown, selector: unknown, options: EsqueryOptions): unknown[];
}

const esquery = esqueryModule as unknown as EsqueryApi;

/** Following `parent` would make the traversal cyclic; the analyzer sets those links for refinements. */
const options: EsqueryOptions = {
  visitorKeys: visitorKeys as Readonly<Record<string, readonly string[]>>,
  fallback: (node) => Object.keys(node).filter((key) => key !== 'parent'),
};

/** Throws on an invalid selector — `validateRules` relies on that. */
export function parseSelector(selector: string): CompiledSelector {
  return esquery.parse(selector) as CompiledSelector;
}

export function matchSelector(ast: TSESTree.Program, selector: CompiledSelector): TSESTree.Node[] {
  return esquery.match(ast, selector, options) as TSESTree.Node[];
}
