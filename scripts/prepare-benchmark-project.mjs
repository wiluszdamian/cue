#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds the project a benchmark is run against: Understudy installed, and a
 * knowledge base of the demo application made the way a user would make one.
 *
 *   node scripts/prepare-benchmark-project.mjs [dir]        (default: benchmarks/project)
 *
 * What it does, in order: init; extract from the demo's source; survey every page
 * that needs no session against the running demo; then the pages behind a login from
 * the snapshots captured for the parser's fixtures (`survey --from`), because
 * `survey` cannot sign in. Nothing here calls a model.
 *
 * The result is the same for the bare and the understudy condition's *scoring*; only
 * the understudy condition is shown it in the prompt.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = join(root, 'examples', 'demo-app');
const understudy = join(root, 'packages', 'cli', 'dist', 'cli.js');
const target = resolve(process.argv[2] ?? join(root, 'benchmarks', 'project'));

if (!existsSync(understudy)) {
  process.stderr.write('packages/cli/dist is missing: run `pnpm build` first.\n');
  process.exit(1);
}

const demoRequire = createRequire(join(demo, 'package.json'));
const cliManifestPath = demoRequire.resolve('@playwright/cli/package.json');
const cliManifest = JSON.parse(readFileSync(cliManifestPath, 'utf8'));
const playwrightCli = join(
  dirname(cliManifestPath),
  typeof cliManifest.bin === 'string' ? cliManifest.bin : cliManifest.bin['playwright-cli'],
);
const snapshots = join(
  root,
  'packages',
  'engine',
  'test',
  'snapshots',
  `playwright-cli@${cliManifest.version}`,
);

function run(args) {
  const result = spawnSync(process.execPath, [understudy, ...args, '--cwd', target], {
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (result.status !== 0) {
    throw new Error(`understudy ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function startDemo(port) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: demo,
    env: { ...process.env, PORT: String(port), DEMO_MUTATIONS: '' },
    stdio: 'ignore',
    shell: false,
  });
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${String(port)}/login`)).ok) {
        return async () => {
          child.kill();
          await exited;
        };
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  child.kill();
  throw new Error('the demo app did not start');
}

// Start clean: a stale map from an earlier run would be scored as if it were this one's.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
writeFileSync(
  join(target, 'package.json'),
  JSON.stringify({ name: 'benchmark-project', private: true }),
);

process.stdout.write(`Preparing ${target}\n`);
run(['init', '--yes']);
process.stdout.write('  init done\n');

const extract = run(['extract', '--source', demo]);
process.stdout.write(
  `  extract: ${
    extract
      .split('\n')
      .find((line) => /test id/.test(line))
      ?.trim() ?? 'done'
  }\n`,
);

const port = await freePort();
const stop = await startDemo(port);
try {
  for (const page of ['login', 'signup', 'items']) {
    run([
      'survey',
      `http://127.0.0.1:${String(port)}/${page}`,
      '--env',
      'benchmark',
      '--playwright-cli',
      playwrightCli,
    ]);
    process.stdout.write(`  surveyed /${page}\n`);
  }
} finally {
  await stop();
}

// Pages behind a login: from the snapshots captured with a signed-in session.
for (const [file, route] of [
  ['dashboard.txt', '/dashboard'],
  ['admin-security.txt', '/admin/settings/security'],
]) {
  const path = join(snapshots, file);
  if (!existsSync(path))
    throw new Error(`missing snapshot ${path}: run scripts/capture-snapshots.mjs`);
  run(['survey', `http://localhost${route}`, '--from', path, '--env', 'benchmark']);
  process.stdout.write(`  surveyed ${route} (from a captured snapshot)\n`);
}

const maps = readdirSync(join(target, '.agent-kb', 'app-map')).filter((name) =>
  name.endsWith('.yaml'),
);
process.stdout.write(`\n${String(maps.length)} route(s) in the knowledge base.\n`);
process.stdout.write(`Next: see benchmarks/RUNBOOK.md\n`);
