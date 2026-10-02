import js from '@eslint/js';
import understudy from '@understudy/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The repo lints itself with its own plugin. Most of the constitution is about
 * Playwright suites and never matches here, but the point is not coverage: a rule
 * that crashes, misfires or reports a nonsense position gets caught by the people
 * who wrote it. It has earned that once already — `no-focused-tests` used to flag
 * `RuleTester.itOnly = it.only`, a reference to `.only` rather than a call.
 */
export default defineConfig([
  globalIgnores([
    '**/dist/',
    '.tsbuild/',
    // A separate Next.js app with its own project and typecheck. Linting it here
    // would mean adding every Next type to a project with no opinion about React.
    'docs/',
    // The landing page and docs site: a separate Astro app with its own install,
    // build and `astro check`, kept out of the monorepo's type-aware lint.
    'site/',
    'coverage/',
    // Scratch workspaces the benchmark writes generated tests into, removed afterwards.
    '**/.benchmark/',
    // Deliberately wrong: they are the rules' test data, and `fixtures/**` falls
    // inside one rule's scope, so linting them fails the suite on its own inputs.
    'packages/*/test/fixtures/',
    // Generated from rules/. Reviewed as a diff, not linted as source.
    'packages/*/src/generated/',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  understudy.configs.recommended,

  {
    languageOptions: {
      globals: globals.nodeBuiltin,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // How every reporter builds a `line:column`.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // The honest spelling for "this key may not be there", and several of ours
      // are not identifiers anyway (`flags['package-manager']`).
      '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }],
    },
  },

  {
    // Plain Node ESM, outside every TypeScript project, and stdout is their job.
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { 'no-console': 'off' },
  },
]);
