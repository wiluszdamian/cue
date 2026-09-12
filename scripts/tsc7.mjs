#!/usr/bin/env node
/**
 * Runs the TypeScript 7 compiler — the only place that decides which of the two
 * installed TypeScripts compiles our source.
 *
 * TypeScript 7 dropped the JavaScript compiler API: `ts.createProgram` is gone,
 * and `@typescript-eslint` needs it for parsing and type-aware linting, while
 * every release caps its peer at `typescript <6.1.0`. So `typescript` resolves to
 * 6.0.3 for those peers and the editor, and TypeScript 7 is installed under the
 * `typescript7` alias and invoked from here — by resolved path, since both
 * packages want the `tsc` binary name.
 *
 * When typescript-eslint supports TypeScript 7, delete this file, drop the alias,
 * and point the build scripts back at plain `tsc`.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

let compiler;
try {
  // Its `exports` do not expose `./lib/tsc.js`, but `./package.json` is exported,
  // which gives the package root to join onto.
  compiler = join(dirname(require.resolve('typescript7/package.json')), 'lib', 'tsc.js');
} catch {
  process.stderr.write(
    'Cannot find the TypeScript 7 compiler. Run `pnpm install` — it is installed\n' +
      'as the `typescript7` alias, not as `typescript`. See scripts/tsc7.mjs.\n',
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [compiler, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
