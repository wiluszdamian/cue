#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Re-captures the snapshot fixtures from the real `@playwright/cli`.
 *
 *   node scripts/capture-snapshots.mjs
 *
 * Starts examples/demo-app on a fixed port, drives the CLI that demo-app has
 * installed (pinned in its package.json), and writes what the CLI printed, byte
 * for byte, to packages/engine/test/snapshots/playwright-cli@<version>/. The
 * version is part of the path so that a CLI upgrade adds a directory instead of
 * overwriting evidence of how the old one behaved. Run it after bumping
 * @playwright/cli, review the diff, and keep both directories if the format moved.
 *
 * The port is fixed because `Page URL:` is part of the output, and a fixture that
 * changes on every run cannot be reviewed.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = join(root, 'examples', 'demo-app');
const PORT = 4399;
const BASE = `http://127.0.0.1:${String(PORT)}`;

const demoRequire = createRequire(join(demo, 'package.json'));
const cliPackage = demoRequire.resolve('@playwright/cli/package.json');
const cliManifest = JSON.parse(readFileSync(cliPackage, 'utf8'));
const cliScript = join(
  dirname(cliPackage),
  typeof cliManifest.bin === 'string' ? cliManifest.bin : cliManifest.bin['playwright-cli'],
);

// The CLI drops a `.playwright-cli/` folder in its working directory.
const work = mkdtempSync(join(tmpdir(), 'cue-capture-'));

function cli(...args) {
  const result = spawnSync(process.execPath, [cliScript, ...args], {
    cwd: work,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`playwright-cli ${args.join(' ')} failed:\n${result.stderr}${result.stdout}`);
  }
  return result.stdout.replaceAll('\r\n', '\n');
}

const login = (email, password) =>
  `() => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, ` +
  `body: JSON.stringify({ email: '${email}', password: '${password}' }) }).then((r) => r.status)`;

const USER = login('user@demo.test', 'user-pass');
const ADMIN = login('admin@demo.test', 'admin-pass');
// Longer than the dashboard's 1.5 s delay, so the welcome heading is there.
const SETTLE = '() => new Promise((resolve) => setTimeout(resolve, 1800))';

const PAGES = [
  { name: 'login', path: '/login' },
  { name: 'signup', path: '/signup' },
  { name: 'items', path: '/items' },
  { name: 'dashboard', path: '/dashboard', as: USER, settle: true },
  { name: 'admin-security', path: '/admin/settings/security', as: ADMIN },
];

function capture(page) {
  try {
    if (page.as === undefined) {
      cli('open', `${BASE}${page.path}`);
    } else {
      // Signing in from inside the page sets the session cookie without needing a ref.
      cli('open', `${BASE}/login`);
      cli('eval', page.as);
      cli('goto', `${BASE}${page.path}`);
    }
    if (page.settle) cli('eval', SETTLE);
    return cli('snapshot');
  } finally {
    try {
      cli('close');
    } catch {
      // Already closed.
    }
  }
}

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: demo,
  env: { ...process.env, PORT: String(PORT), DEMO_MUTATIONS: '' },
  stdio: 'ignore',
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/login`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`demo-app did not start on port ${String(PORT)} — is something else using it?`);
}

try {
  await waitForServer();
  const version = cli('--version').trim();
  const out = join(root, 'packages', 'engine', 'test', 'snapshots', `playwright-cli@${version}`);
  mkdirSync(out, { recursive: true });

  for (const page of PAGES) {
    writeFileSync(join(out, `${page.name}.txt`), capture(page), 'utf8');
    process.stdout.write(`captured ${page.name}\n`);
  }
  process.stdout.write(`\nwritten to ${out}\n`);
} finally {
  server.kill();
  rmSync(work, { recursive: true, force: true });
}
