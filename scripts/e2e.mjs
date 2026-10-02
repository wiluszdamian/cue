#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The whole path a user takes, against a real browser:
 *
 *   extract → survey → locator → check → reference tests → verify → a broken app → verify
 *
 * Run it after `pnpm build`, with Chromium installed for the demo app
 * (`pnpm --filter @wiluszdamian/cue-demo-app exec playwright install chromium`):
 *
 *   node scripts/e2e.mjs
 *
 * Nothing goes through a shell. The project it builds lives in a directory with a
 * space in its name, and the first survey URL carries `&` and `%`, because those
 * are the two things a shell-built command line gets wrong.
 *
 * Protected pages (the dashboard, admin settings) are not surveyed: `survey` has no
 * way to sign in, and `--from <snapshot>` exists for those. The routes below are
 * the ones that need no session.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = join(root, 'examples', 'demo-app');
const cue = join(root, 'packages', 'cli', 'dist', 'cli.js');

const demoRequire = createRequire(join(demo, 'package.json'));
const cliManifestPath = demoRequire.resolve('@playwright/cli/package.json');
const cliManifest = JSON.parse(readFileSync(cliManifestPath, 'utf8'));
const playwrightCli = join(
  dirname(cliManifestPath),
  typeof cliManifest.bin === 'string' ? cliManifest.bin : cliManifest.bin['playwright-cli'],
);
const playwrightTest = demoRequire.resolve('@playwright/test/cli');

// ----------------------------------------------------------------- reporting

let step = 0;
const failures = [];

function say(text) {
  process.stdout.write(`${text}\n`);
}

function begin(title) {
  step += 1;
  say(`\n[${String(step).padStart(2, '0')}] ${title}`);
}

function expect(condition, what, detail = '') {
  if (condition) {
    say(`     ok   ${what}`);
  } else {
    failures.push(what);
    say(`     FAIL ${what}`);
    if (detail !== '') say(detail.replace(/^/gm, '          '));
  }
}

function fail(message) {
  throw new Error(message);
}

// --------------------------------------------------------------- processes

function run(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    shell: false,
    ...options,
    env: { ...process.env, ...options.env, NO_COLOR: '1' },
  });
  return {
    status: result.status,
    out: `${result.stdout}${result.stderr}`,
    stdout: result.stdout,
  };
}

function cli(project, args, extra = []) {
  return run([cue, ...args, '--cwd', project, ...extra]);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startDemo(port, mutations = '') {
  const logs = [];
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: demo,
    env: { ...process.env, PORT: String(port), DEMO_MUTATIONS: mutations },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));
  const exited = new Promise((resolve) => child.once('exit', resolve));

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${String(port)}/login`)).ok) {
        return {
          logs,
          async stop() {
            child.kill();
            await exited;
          },
        };
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  fail(`demo-app did not start on port ${String(port)}:\n${logs.join('')}`);
}

// ------------------------------------------------------------------- scenario

const keep = process.argv.includes('--keep');
// A space in the path is the point.
const project = join(mkdtempSync(join(tmpdir(), 'cue e2e ')), 'my project');
mkdirSync(project, { recursive: true });
writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'e2e', private: true }));

let server;
try {
  if (!existsSync(cue)) fail('packages/cli/dist is missing: run `pnpm build` first.');

  const port = await freePort();
  const base = `http://127.0.0.1:${String(port)}`;
  const withCli = ['--playwright-cli', playwrightCli];

  begin('init a fresh project');
  const init = cli(project, ['init', '--yes']);
  expect(init.status === 0, 'init succeeds', init.out);
  expect(existsSync(join(project, 'AGENTS.md')), 'AGENTS.md was written');

  begin('start the demo app');
  server = await startDemo(port);
  say(`     listening on ${base}`);

  begin('extract what the product source declares');
  const extract = cli(project, ['extract', '--source', demo]);
  expect(extract.status === 0, 'extract succeeds', extract.out);
  const testIds = readFileSync(join(project, '.agent-kb', 'product', 'testids.yaml'), 'utf8');
  const surface = readFileSync(join(project, '.agent-kb', 'product', 'surface.yaml'), 'utf8');
  expect(testIds.includes('testId: login-submit'), 'the login test id was found');
  expect(
    surface.includes('path: /api/login') && surface.includes('method: POST'),
    'POST /api/login was found in the OpenAPI document',
  );

  begin('survey a page whose URL has & and % in it');
  const survey = cli(
    project,
    ['survey', `${base}/login?next=%2Fdashboard&utm=a`, '--env', 'e2e'],
    withCli,
  );
  expect(survey.status === 0, 'survey succeeds', survey.out);
  const loginMap = join(project, '.agent-kb', 'app-map', 'login.yaml');
  expect(existsSync(loginMap), 'the map for /login was written');
  const login = existsSync(loginMap) ? readFileSync(loginMap, 'utf8') : '';
  expect(login.includes('schemaVersion: 2'), 'it is a version 2 map');
  expect(login.includes("getByRole('button', { name: 'Log in' })"), 'the Log in button is in it');
  expect(login.includes('environment: e2e'), 'the environment is named');
  expect(!login.includes('127.0.0.1') && !login.includes('http'), 'no address was written');
  expect(!login.includes('utm='), 'the query string did not leak into the map');

  begin('survey the other pages that need no session');
  for (const page of ['signup', 'items']) {
    const result = cli(project, ['survey', `${base}/${page}`], withCli);
    expect(result.status === 0, `/${page} surveyed`, result.out);
  }

  begin('look at some pages again, by name, and not all of them');
  const plan = cli(project, [
    'survey',
    '--route',
    '/signup,/items/[id]',
    '--base-url',
    base,
    '--dry-run',
  ]);
  expect(plan.status === 0, 'the plan is shown', plan.out);
  expect(
    plan.out.includes('/signup') && plan.out.includes('skipped'),
    'a page with a parameter is skipped',
    plan.out,
  );
  expect(plan.out.includes('Dry run: nothing was opened'), 'a dry run opens nothing');
  const again = cli(
    project,
    ['survey', '--route', '/signup', '--base-url', base, '--env', 'e2e'],
    withCli,
  );
  expect(again.status === 0, 'the named page is surveyed again', again.out);
  expect(
    again.out.includes('unchanged') && again.out.includes('1 unchanged'),
    'and found as it was',
    again.out,
  );
  expect(again.out.includes('/login') === false, 'the other pages are left alone', again.out);
  const noAddress = run([cue, 'survey', '--route', '/signup', '--cwd', project], {
    env: { CUE_BASE_URL: '' },
  });
  expect(
    noAddress.status === 2 && noAddress.out.includes('--base-url'),
    'it asks for the address instead of guessing',
    noAddress.out,
  );

  begin('look a locator up');
  const locator = cli(project, ['locator', 'log in', '--route', '/login']);
  expect(
    locator.stdout.includes("getByRole('button', { name: 'Log in' })"),
    'the answer is the real locator',
    locator.out,
  );

  begin('check the reference page objects against what was surveyed');
  for (const dir of ['pages', 'fixtures', 'tests']) {
    cpSync(join(demo, dir), join(project, 'suite', dir), { recursive: true });
  }
  const known = ['login', 'signup', 'items'].map((name) => `suite/pages/${name}-page.ts`);
  // The page objects also reach for things that only appear after an action (an error, a
  // status). `survey` cannot click, so the notes know them only from the tests that mention
  // them: inferred, and said to be unverified rather than passed as known.
  const good = cli(project, ['check', ...known, '--ci']);
  expect(
    good.status === 0,
    'nothing in the page objects is unknown or on the wrong page',
    good.out,
  );
  expect(
    /\d+ locator\(s\): \d+ known, \d+ unverified, \d+ undecidable \(not judged\)/.test(good.out),
    'the summary counts what was judged and what was not (and nothing else)',
    good.out,
  );
  const strict = cli(project, ['check', ...known, '--ci=strict']);
  expect(strict.status === 1, 'strict refuses what no survey has seen', strict.out);
  expect(
    strict.out.includes('only inferred') && strict.out.includes('never seen running'),
    'and says why: a test is evidence, not an observation',
    strict.out,
  );

  writeFileSync(
    join(project, 'suite', 'invented.spec.ts'),
    [
      "import { test } from '@playwright/test';",
      "test('invented', { tag: ['@smoke'] }, async ({ page }) => {",
      "  await page.goto('/login');",
      "  await page.getByRole('button', { name: 'Sign in now' }).click();",
      '});',
    ].join('\n'),
  );
  const bad = cli(project, ['check', 'suite/invented.spec.ts', '--ci']);
  expect(bad.status === 1, 'an invented locator fails the build', bad.out);
  expect(
    bad.out.includes("getByRole('button', { name: 'Log in' })"),
    'it suggests the real locator',
    bad.out,
  );

  begin('run the reference Playwright tests in a real browser');
  const testPort = await freePort();
  const tests = run([playwrightTest, 'test', '--reporter=line'], {
    cwd: demo,
    env: { DEMO_PORT: String(testPort), DEMO_MUTATIONS: '' },
  });
  expect(tests.status === 0, 'all reference tests pass', tests.out.slice(-1500));

  begin('verify the map against the running app');
  const pass = cli(project, ['verify', '--base-url', base, '--ci=strict', '--env', 'e2e'], withCli);
  expect(pass.status === 0, 'strict verify passes', pass.out);
  expect(pass.out.includes('PASS'), 'the verdict is PASS');

  begin('verify without an environment claims nothing');
  const unverified = cli(project, ['verify', '--ci=strict']);
  expect(unverified.status === 1, 'strict fails when nothing was checked', unverified.out);
  expect(unverified.out.includes('NOT VERIFIED'), 'the verdict is NOT VERIFIED');
  expect(!unverified.out.includes('matches the application'), 'it does not say the map matches');

  begin('break the app, and verify notices');
  await server.stop();
  server = await startDemo(port, 'login-button-renamed');
  const drifted = cli(project, ['verify', '--base-url', base, '--ci'], withCli);
  expect(drifted.status === 1, 'verify fails on drift', drifted.out);
  expect(drifted.out.includes('drift'), 'the route is reported as drifted');
  expect(
    drifted.out.includes("gone: getByRole('button', { name: 'Log in' })"),
    'it names the element that disappeared',
    drifted.out,
  );

  begin('and check still passes, because it reads the map, not the app');
  const stillKnown = cli(project, ['check', ...known, '--ci']);
  expect(stillKnown.status === 0, 'check is about the map', stillKnown.out);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  say(`\nFAILED: ${failures.at(-1)}`);
} finally {
  if (server !== undefined) await server.stop();
  if (keep) say(`\nkept ${project}`);
  else rmSync(dirname(project), { recursive: true, force: true });
}

say('');
if (failures.length > 0) {
  say(`${String(failures.length)} check(s) failed:`);
  for (const failure of failures) say(`  - ${failure}`);
  process.exit(1);
}
say(`all ${String(step)} steps passed.`);
