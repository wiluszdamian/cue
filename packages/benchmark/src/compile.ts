import { join, relative } from 'node:path';
import ts from 'typescript';
import type { CompileResult } from './execution.js';

/**
 * Type-checks the generated files with the project's own compiler, against the
 * types the demo application's tests are written against. A test that does not
 * compile was never going to be trusted, and a model that invents an API shows up here.
 */

const SHOWN = 8;

export function compileFiles(
  workspace: string,
  files: readonly string[],
  demoRoot: string,
): CompileResult {
  const sources = files.filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts'));
  if (sources.length === 0) return { ok: true, errors: [], filesChecked: 0 };

  const program = ts.createProgram({
    rootNames: sources.map((file) => join(workspace, file)),
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      // Types come from the demo application's install, not from wherever this runs.
      typeRoots: [join(demoRoot, 'node_modules', '@types')],
      types: ['node'],
    },
  });

  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
      if (diagnostic.file === undefined || diagnostic.start === undefined) {
        return `TS${String(diagnostic.code)} ${message}`;
      }
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      const where = relative(workspace, diagnostic.file.fileName).replaceAll('\\', '/');
      return `${where}(${String(line + 1)},${String(character + 1)}): TS${String(diagnostic.code)} ${message}`;
    });

  return {
    ok: errors.length === 0,
    errors: errors.slice(0, SHOWN),
    filesChecked: sources.length,
  };
}
