import { ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { dirname } from 'node:path';
import {
  analyzeLocators,
  cachedKnowledgeIndex,
  findKnowledgeRoot,
  getFixer,
  getRefinement,
  normalizePath,
  REPORTED_VERDICTS,
  scopeMatcher,
  type EnforceableRule,
  type RefineContext,
} from '@understudy/engine';
import { CANONICAL_TAGS } from './generated/constitution.js';

/**
 * Turns one constitution entry into one ESLint rule, re-implementing nothing:
 * ESLint takes esquery selectors as listener keys, the same language the engine
 * evaluates, and refinements and fixers are imported rather than rewritten. A
 * rule cannot mean one thing in `understudy inspect` and another in `eslint`.
 */

const createRule = ESLintUtils.RuleCreator<{ docsAnchor: string }>(
  (name) => `https://github.com/understudy-dev/understudy/blob/main/docs/rules/${name}.md`,
);

export type UnderstudyRule = TSESLint.RuleModule<'violation'>;

function buildRefineContext(
  context: Readonly<TSESLint.RuleContext<'violation', []>>,
): RefineContext {
  const source = context.sourceCode;
  return {
    filePath: normalizePath(context.filename),
    text: source.getText(),
    comments: source.getAllComments(),
    canonicalTags: CANONICAL_TAGS,
  };
}

function astListeners(
  rule: EnforceableRule,
  context: Readonly<TSESLint.RuleContext<'violation', []>>,
): TSESLint.RuleListener {
  if (rule.detector.kind !== 'ast') return {};

  const refine = rule.detector.refine ? getRefinement(rule.detector.refine) : undefined;
  const fixer = rule.autofix ? getFixer(rule.id) : undefined;
  let refineContext: RefineContext | undefined;

  return {
    // Handed to ESLint verbatim: the join between the constitution and the linter.
    [rule.detector.selector]: (node: TSESTree.Node): void => {
      if (refine) {
        refineContext ??= buildRefineContext(context);
        if (!refine(node, refineContext)) return;
      }

      const fix = fixer?.(node);
      context.report({
        node,
        messageId: 'violation',
        ...(fix
          ? { fix: (f: TSESLint.RuleFixer) => f.replaceTextRange([...fix.range], fix.text) }
          : {}),
      });
    },
  };
}

function regexListeners(
  rule: EnforceableRule,
  context: Readonly<TSESLint.RuleContext<'violation', []>>,
): TSESLint.RuleListener {
  if (rule.detector.kind !== 'regex') return {};
  const flags = rule.detector.flags.includes('g') ? rule.detector.flags : `${rule.detector.flags}g`;
  const pattern = new RegExp(rule.detector.pattern, flags);

  return {
    'Program:exit': (): void => {
      const source = context.sourceCode;
      const text = source.getText();
      for (const match of text.matchAll(pattern)) {
        context.report({
          loc: {
            start: source.getLocFromIndex(match.index),
            end: source.getLocFromIndex(match.index + match[0].length),
          },
          messageId: 'violation',
        });
      }
    },
  };
}

/**
 * Checks locators against the knowledge base found above the file being linted.
 * A project with no `.agent-kb` gets silence: ESLint has no way to say "not
 * checked", so `understudy check` and `understudy doctor` are where that is said
 * out loud.
 */
function knowledgeListeners(
  rule: EnforceableRule,
  context: Readonly<TSESLint.RuleContext<'violation', []>>,
): TSESLint.RuleListener {
  if (rule.detector.kind !== 'knowledge') return {};

  return {
    'Program:exit': (): void => {
      const root = findKnowledgeRoot(dirname(context.filename));
      if (root === undefined) return;

      const findings = analyzeLocators({
        filePath: normalizePath(context.filename),
        source: context.sourceCode.getText(),
        index: cachedKnowledgeIndex(root),
      });
      for (const finding of findings) {
        if (!REPORTED_VERDICTS.has(finding.verdict)) continue;
        context.report({
          // Ours are 1-based, ESLint's columns are 0-based.
          loc: {
            start: { line: finding.line, column: finding.column - 1 },
            end: { line: finding.endLine, column: finding.endColumn - 1 },
          },
          messageId: 'violation',
          data: { detail: finding.suggestion },
        });
      }
    },
  };
}

/**
 * Scope lives in the constitution, so a rule carries it wherever it is enabled.
 * The engine's matcher is anchored so it applies to ESLint's absolute filenames
 * without a project root — `context.cwd` is routinely not the repo root.
 */
export function buildRule(rule: EnforceableRule): UnderstudyRule {
  const inScope = scopeMatcher(rule);
  const message = rule.message.replace(/\s+/g, ' ').trim();

  return createRule({
    name: rule.id,
    meta: {
      type: rule.tier === 'SHOULD' ? 'suggestion' : 'problem',
      docs: {
        description: rule.title,
        docsAnchor: rule.docsAnchor,
      },
      // The whole product of a blocked write: what is wrong, why, what to do instead.
      // A rule that checks against the knowledge base says what it found, too.
      messages: {
        violation: rule.detector.kind === 'knowledge' ? `${message} {{detail}}` : message,
      },
      schema: [],
      ...(rule.autofix ? { fixable: 'code' as const } : {}),
    },
    defaultOptions: [],
    create(context) {
      if (!inScope(context.filename)) return {};
      switch (rule.detector.kind) {
        case 'ast':
          return astListeners(rule, context);
        case 'regex':
          return regexListeners(rule, context);
        case 'knowledge':
          return knowledgeListeners(rule, context);
      }
    },
  });
}
