import { parse, type TSESTree } from '@typescript-eslint/typescript-estree';
import type { AnalysisResult, AnalysisSkip, Diagnostic, NotChecked } from './diagnostic.js';
import { sortDiagnostics } from './diagnostic.js';
import { matchSelector, parseSelector, type CompiledSelector } from './detectors/esquery.js';
import { getFixer } from './detectors/fixers.js';
import { getRefinement, type RefineContext } from './detectors/refinements.js';
import {
  isEnforceable,
  type Constitution,
  type EnforceableRule,
  type Rule,
} from './schema/constitution.js';
import type { KnowledgeIndex } from './knowledge/index.js';
import type { TagSet } from './schema/tags.js';
import { normalizePath, scopeMatcher } from './scope.js';
import { analyzeLocators } from './verification/locator-analyzer.js';
import { findingToDiagnostic } from './verification/diagnostics.js';

export interface SourceFile {
  readonly path: string;
  readonly text: string;
}

export interface AnalyzeOptions {
  readonly files: readonly SourceFile[];
  readonly constitution: Constitution;
  readonly tags: TagSet;
  readonly docsBaseUrl?: string;
  /** Skip rules whose id is listed. Used by the ESLint plugin, which owns them. */
  readonly disabled?: readonly string[];
  /**
   * What is known about the application. Rules that check against it cannot run
   * without it, and say so in the result instead of passing.
   */
  readonly knowledge?: KnowledgeIndex;
  /** For judging how recently knowledge was confirmed. Defaults to the present. */
  readonly now?: Date;
}

const DEFAULT_DOCS_BASE =
  'https://github.com/wiluszdamian/project-cue/blob/main/docs/constitution.md';

export function docsUrlFor(rule: Rule, base = DEFAULT_DOCS_BASE): string {
  return `${base}#${rule.docsAnchor}`;
}

/** Compiled once per analysis: glob and selector parsing both cost, across thousands of files. */
interface CompiledRule {
  readonly rule: EnforceableRule;
  readonly matches: (path: string) => boolean;
  readonly selector?: CompiledSelector;
  readonly refine?: ReturnType<typeof getRefinement>;
}

function compile(constitution: Constitution, disabled: readonly string[]): CompiledRule[] {
  const skip = new Set(disabled);
  const compiled: CompiledRule[] = [];

  for (const rule of constitution.rules) {
    if (!isEnforceable(rule) || skip.has(rule.id) || rule.deprecated !== null) continue;

    compiled.push({
      rule,
      matches: scopeMatcher(rule),
      ...(rule.detector.kind === 'ast'
        ? {
            selector: parseSelector(rule.detector.selector),
            ...(rule.detector.refine ? { refine: getRefinement(rule.detector.refine) } : {}),
          }
        : {}),
    });
  }

  return compiled;
}

/** typescript-estree does not guarantee parent links, and two refinements need them. */
function linkParents(root: TSESTree.Node): void {
  const stack: TSESTree.Node[] = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      for (const child of Array.isArray(value) ? value : [value]) {
        if (
          child &&
          typeof child === 'object' &&
          typeof (child as TSESTree.Node).type === 'string'
        ) {
          (child as { parent?: TSESTree.Node }).parent = node;
          stack.push(child as TSESTree.Node);
        }
      }
    }
  }
}

function snippetAt(text: string, start: number, end: number): string {
  const raw = text.slice(start, Math.min(end, start + 200));
  return raw.includes('\n') ? `${raw.split('\n')[0] ?? ''} …` : raw;
}

function positionAt(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
}

function runAstRule(
  compiled: CompiledRule,
  file: SourceFile,
  ast: TSESTree.Program,
  ctx: RefineContext,
  docsBase: string,
): Diagnostic[] {
  const { rule, selector, refine } = compiled;
  if (!selector) return [];

  const fixer = rule.autofix ? getFixer(rule.id) : undefined;
  const found: Diagnostic[] = [];

  for (const node of matchSelector(ast, selector)) {
    if (refine && !refine(node, ctx)) continue;

    const fix = fixer?.(node);
    found.push({
      ruleId: rule.id,
      file: file.path,
      line: node.loc.start.line,
      column: node.loc.start.column + 1,
      endLine: node.loc.end.line,
      endColumn: node.loc.end.column + 1,
      severity: rule.severity,
      message: rule.message.trim(),
      docsUrl: docsUrlFor(rule, docsBase),
      snippet: snippetAt(file.text, node.range[0], node.range[1]),
      ...(fix ? { fix } : {}),
    });
  }

  return found;
}

function runKnowledgeRule(
  compiled: CompiledRule,
  file: SourceFile,
  index: KnowledgeIndex,
  now: Date | undefined,
  docsBase: string,
): Diagnostic[] {
  const { rule } = compiled;
  if (rule.detector.kind !== 'knowledge') return [];

  const lead = rule.message.replace(/\s+/g, ' ').trim();
  const url = docsUrlFor(rule, docsBase);
  return analyzeLocators({
    filePath: file.path,
    source: file.text,
    index,
    ...(now === undefined ? {} : { now }),
  }).flatMap((finding) => {
    const diagnostic = findingToDiagnostic(finding, file.path, url, {
      severity: rule.severity,
      lead,
    });
    return diagnostic === undefined ? [] : [{ ...diagnostic, ruleId: rule.id }];
  });
}

function runRegexRule(compiled: CompiledRule, file: SourceFile, docsBase: string): Diagnostic[] {
  const { rule } = compiled;
  if (rule.detector.kind !== 'regex') return [];

  const flags = rule.detector.flags.includes('g') ? rule.detector.flags : `${rule.detector.flags}g`;
  const pattern = new RegExp(rule.detector.pattern, flags);
  const found: Diagnostic[] = [];

  for (const match of file.text.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    const from = positionAt(file.text, start);
    const to = positionAt(file.text, end);
    found.push({
      ruleId: rule.id,
      file: file.path,
      line: from.line,
      column: from.column,
      endLine: to.line,
      endColumn: to.column,
      severity: rule.severity,
      message: rule.message.trim(),
      docsUrl: docsUrlFor(rule, docsBase),
      snippet: match[0],
    });
  }

  return found;
}

/**
 * Runs the enforceable constitution. `manual` rules are never evaluated: they keep
 * the documented and enforced standards one list, with the gap visible.
 */
export function analyze(options: AnalyzeOptions): AnalysisResult {
  const startedAt = performance.now();
  const docsBase = options.docsBaseUrl ?? DEFAULT_DOCS_BASE;
  const canonicalTags = options.tags.tags.map((t) => t.name);
  const compiled = compile(options.constitution, options.disabled ?? []);

  const diagnostics: Diagnostic[] = [];
  const skipped: AnalysisSkip[] = [];
  const notChecked = new Map<string, NotChecked>();
  let filesAnalyzed = 0;

  for (const input of options.files) {
    const file: SourceFile = { path: normalizePath(input.path), text: input.text };
    const applicable = compiled.filter((c) => c.matches(file.path));
    if (applicable.length === 0) continue;

    const needsAst = applicable.some((c) => c.rule.detector.kind === 'ast');
    let ast: TSESTree.Program | undefined;
    let comments: readonly TSESTree.Comment[] = [];

    if (needsAst) {
      try {
        ast = parse(file.text, {
          loc: true,
          range: true,
          comment: true,
          jsx: file.path.endsWith('.tsx'),
        });
        linkParents(ast);
        comments = ast.comments ?? [];
      } catch (error) {
        skipped.push({
          file: file.path,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }

    filesAnalyzed += 1;
    const ctx: RefineContext = {
      filePath: file.path,
      text: file.text,
      comments,
      canonicalTags,
    };

    for (const c of applicable) {
      switch (c.rule.detector.kind) {
        case 'ast':
          if (ast) diagnostics.push(...runAstRule(c, file, ast, ctx, docsBase));
          break;
        case 'regex':
          diagnostics.push(...runRegexRule(c, file, docsBase));
          break;
        case 'knowledge':
          if (options.knowledge === undefined) {
            notChecked.set(c.rule.id, {
              ruleId: c.rule.id,
              reason: 'no knowledge base was given, so nothing was checked against it',
            });
          } else {
            diagnostics.push(
              ...runKnowledgeRule(c, file, options.knowledge, options.now, docsBase),
            );
          }
          break;
      }
    }
  }

  return {
    diagnostics: sortDiagnostics(diagnostics),
    skipped,
    notChecked: [...notChecked.values()],
    filesAnalyzed,
    durationMs: Math.round(performance.now() - startedAt),
  };
}
