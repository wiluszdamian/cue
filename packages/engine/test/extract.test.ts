import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extract } from '../src/agent-kb/extract/run.js';
import {
  laravelAdapter,
  nextAdapter,
  openApiAdapter,
  testIdAdapter,
} from '../src/agent-kb/extract/adapters.js';
import { scanSource } from '../src/agent-kb/extract/scan.js';
import { correlate } from '../src/agent-kb/store.js';
import { parseSnapshot } from '../src/agent-kb/snapshot/index.js';

/**
 * `extract` reads a repository that may not belong to whoever runs it.
 *
 * So the tests here are as much about restraint as about extraction: which files
 * are never opened, what never reaches the knowledge base, and what happens when
 * the stack is unrecognised or the source is missing entirely.
 */

let product: string;
let project: string;

function write(root: string, path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

beforeEach(() => {
  product = mkdtempSync(join(tmpdir(), 'cue-product-'));
  project = mkdtempSync(join(tmpdir(), 'cue-suite-'));

  write(product, 'next.config.js', 'module.exports = {};\n');
  write(
    product,
    'app/login/page.tsx',
    `export default function LoginPage() {
  return (
    <main>
      <h1>Welcome back</h1>
      <input aria-label="Email" data-testid="login-email" />
      <button data-testid="log-in">Log in</button>
    </main>
  );
}
`,
  );
  write(product, 'app/(marketing)/blog/[slug]/page.tsx', 'export default function P() {}\n');
  write(
    product,
    'app/api/users/route.ts',
    'export async function GET() {}\nexport async function POST() {}\n',
  );
  write(product, 'locales/en.json', '{\n  "login.submit": "Log in"\n}\n');
});

afterEach(() => {
  rmSync(product, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

describe('what is never read', () => {
  it('does not open a .env file', () => {
    write(product, '.env', 'API_TOKEN=sk-abcdefghijklmnopqrstuvwx\n');
    const scan = scanSource(product);
    expect(scan.files.map((f) => f.path)).not.toContain('.env');
  });

  it('does not open keys or certificates', () => {
    write(product, 'certs/server.pem', 'private key material');
    write(product, 'certs/id.key', 'private key material');
    const paths = scanSource(product).files.map((f) => f.path);
    expect(paths.some((p) => p.endsWith('.pem') || p.endsWith('.key'))).toBe(false);
  });

  it('does not descend into dependencies or build output', () => {
    write(product, 'node_modules/pkg/index.js', 'export const x = 1;');
    write(product, 'dist/bundle.js', 'export const y = 1;');
    const paths = scanSource(product).files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('node_modules/') || p.startsWith('dist/'))).toBe(false);
  });

  it('ignores file types it has no reason to open', () => {
    write(product, 'data/dump.sql', 'INSERT INTO users VALUES (1);');
    expect(scanSource(product).files.map((f) => f.path)).not.toContain('data/dump.sql');
  });
});

describe('what is written', () => {
  it('records structure and references, never product code', () => {
    extract({ projectRoot: project, sourceRoot: product });

    const written = ['testids.yaml', 'surface.yaml', 'vocabulary.yaml', 'sources.json']
      .map((name) => readFileSync(join(project, '.agent-kb/product', name), 'utf8'))
      .join('\n');

    // The one line of real code in the fixture must not appear anywhere.
    expect(written).not.toContain('export default function LoginPage');
    expect(written).not.toContain('<main>');
    // References, though, must.
    expect(written).toContain('app/login/page.tsx:');
  });

  it('writes nothing at all into the product repository', () => {
    const before = scanSource(product).files.map((f) => `${f.path}:${f.hash}`);
    extract({ projectRoot: project, sourceRoot: product });
    const after = scanSource(product).files.map((f) => `${f.path}:${f.hash}`);
    // It may not even be yours.
    expect(after).toEqual(before);
  });

  it('records the commit when the product is a git checkout', () => {
    // Not a checkout here, so it must say so rather than inventing a version.
    const result = extract({ projectRoot: project, sourceRoot: product });
    expect(result.commit).toBeUndefined();
    expect(result.gaps.join(' ')).toContain('not a git checkout');
  });

  it('lists every file it read, with a hash and no content', () => {
    extract({ projectRoot: project, sourceRoot: product });
    const sources = JSON.parse(
      readFileSync(join(project, '.agent-kb/product/sources.json'), 'utf8'),
    ) as { files: { path: string; hash: string }[] };

    expect(sources.files.length).toBeGreaterThan(0);
    for (const file of sources.files) {
      expect(file.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(Object.keys(file).sort()).toEqual(['hash', 'path']);
    }
  });
});

describe('the Next.js adapter', () => {
  const context = () => ({ files: scanSource(product).files });

  it('recognises the stack', () => {
    expect(nextAdapter.detect(context())).toBe(true);
  });

  it('strips route groups, which are not URL segments', () => {
    const surface = nextAdapter.extract(context()).surface ?? [];
    expect(surface.map((e) => e.path)).toContain('/blog/[slug]');
    expect(surface.some((e) => e.path.includes('(marketing)'))).toBe(false);
  });

  it('reads one endpoint per exported verb', () => {
    const endpoints = (nextAdapter.extract(context()).surface ?? []).filter(
      (e) => e.kind === 'endpoint',
    );
    expect(endpoints.map((e) => e.method).sort()).toEqual(['GET', 'POST']);
  });

  it('anchors every entry to a file and line', () => {
    for (const entry of nextAdapter.extract(context()).surface ?? []) {
      expect(entry.source).toMatch(/^.+:\d+$/);
    }
  });
});

describe('the Next.js adapter, and a folder that is only called pages', () => {
  const surfaceOf = (root: string) =>
    nextAdapter.extract({ files: scanSource(root).files }).surface?.map((entry) => entry.path) ??
    [];

  function repo(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'cue-next-'));
    for (const [path, text] of Object.entries(files)) write(root, path, text);
    return root;
  }

  it('does not turn a test suite’s page objects into routes', () => {
    const root = repo({
      'pages/login-page.ts': 'export class LoginPage {}\n',
      'pages/items-page.ts': 'export class ItemsPage {}\n',
      'tests/a.spec.ts': 'export {};\n',
    });
    try {
      expect(nextAdapter.detect({ files: scanSource(root).files })).toBe(false);
      expect(surfaceOf(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads the Pages Router when there is evidence the project is Next.js', () => {
    for (const evidence of [
      { 'next.config.js': 'module.exports = {};\n' },
      { 'package.json': '{ "dependencies": { "next": "^14.0.0" } }\n' },
    ]) {
      const root = repo({
        ...evidence,
        'pages/index.tsx': 'x',
        'pages/about.tsx': 'x',
        'pages/api/hi.ts': 'x',
      });
      try {
        expect(surfaceOf(root).sort()).toEqual(['/', '/about', '/api/hi']);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('keeps to the Next.js project in a monorepo, and leaves the suite beside it alone', () => {
    const root = repo({
      'apps/web/next.config.mjs': 'export default {};\n',
      'apps/web/pages/index.tsx': 'x',
      'apps/web/pages/pricing.tsx': 'x',
      'e2e/pages/login-page.ts': 'export class LoginPage {}\n',
    });
    try {
      expect(surfaceOf(root).sort()).toEqual(['/', '/pricing']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('still reads the App Router without a config, since page.tsx is Next’s own name', () => {
    const root = repo({ 'app/settings/page.tsx': 'x', 'app/page.tsx': 'x' });
    try {
      expect(surfaceOf(root).sort()).toEqual(['/', '/settings']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the test-id adapter', () => {
  it('finds ids and points at the first place each is defined', () => {
    const ids = testIdAdapter.extract({ files: scanSource(product).files }).testIds ?? [];
    expect(ids.map((e) => e.testId).sort()).toEqual(['log-in', 'login-email']);
    expect(ids.every((e) => /^.+:\d+$/.test(e.source))).toBe(true);
  });

  it('runs on any stack, because every codebase might have them', () => {
    expect(testIdAdapter.detect({ files: [] })).toBe(true);
  });
});

describe('the OpenAPI adapter', () => {
  it('reads paths and methods without needing a valid document', () => {
    write(
      product,
      'openapi.yaml',
      [
        'paths:',
        '  /users:',
        '    get:',
        '      summary: list',
        '    post:',
        '      summary: create',
      ].join('\n'),
    );
    const surface = openApiAdapter.extract({ files: scanSource(product).files }).surface ?? [];
    expect(surface.map((e) => `${e.method ?? ''} ${e.path}`).sort()).toEqual([
      'GET /users',
      'POST /users',
    ]);
  });
});

describe('degrading rather than failing', () => {
  it('says what it cannot establish when there is no source at all', () => {
    const result = extract({ projectRoot: project, sourceRoot: join(project, 'nowhere') });
    // Black box is a documented level of access, not an error.
    expect(result.written).toEqual([]);
    expect(result.gaps.join(' ')).toContain('survey');
  });

  it('still finds test ids in a stack nobody wrote an adapter for', () => {
    const plain = mkdtempSync(join(tmpdir(), 'cue-plain-'));
    write(plain, 'index.html', '<button data-testid="buy-now">Buy</button>');

    const result = extract({ projectRoot: project, sourceRoot: plain });
    expect(result.testIds.map((t) => t.testId)).toEqual(['buy-now']);
    rmSync(plain, { recursive: true, force: true });
  });

  it('warns when nothing can ever be confirmed', () => {
    const empty = mkdtempSync(join(tmpdir(), 'cue-empty-'));
    write(empty, 'index.html', '<button>Buy</button>');

    const result = extract({ projectRoot: project, sourceRoot: empty });
    expect(result.gaps.join(' ')).toContain('No data-testid attributes found');
    rmSync(empty, { recursive: true, force: true });
  });
});

describe('the point of doing both', () => {
  it('upgrades a surveyed element to confirmed once the source agrees', () => {
    extract({ projectRoot: project, sourceRoot: product });

    const snapshot = readFileSync(join(import.meta.dirname, 'snapshots', 'login.txt'), 'utf8');
    const elements = parseSnapshot(snapshot).elements;
    expect(elements.every((e) => e.confidence === 'runtime-only')).toBe(true);

    const testIds = JSON.parse(
      JSON.stringify({
        schemaVersion: 1,
        testIds: [{ testId: 'log-in', source: 'app/login/page.tsx:6' }],
      }),
    ) as never;

    const correlated = correlate(elements, testIds);
    const button = correlated.find((e) => e.name === 'Log in');
    // Neither source alone proves a selector is real *and* reachable.
    expect(button?.confidence).toBe('confirmed');
    expect(button?.testId).toBe('log-in');
  });
});

describe('extract options', () => {
  it('--dry-run reports what it would write and writes nothing', () => {
    const result = extract({ projectRoot: project, sourceRoot: product, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.written).toEqual([]);
    expect(result.wouldWrite.length).toBeGreaterThan(0);
    expect(existsSync(join(project, '.agent-kb'))).toBe(false);
  });

  it('leaves excluded directories out, so a template app is not taken for the product', () => {
    write(product, 'resources/apps/starter/package.json', '{"dependencies":{"next":"14"}}\n');
    write(product, 'resources/apps/starter/pages/about.tsx', 'export default () => null;\n');

    const withTemplates = scanSource(product);
    expect(withTemplates.files.some((f) => f.path.startsWith('resources/apps/'))).toBe(true);

    const without = scanSource(product, undefined, { exclude: ['resources/apps'] });
    expect(without.files.some((f) => f.path.startsWith('resources/apps/'))).toBe(false);
  });

  it('does not take a package.json with a key called next for a Next.js project', () => {
    const only = mkdtempSync(join(tmpdir(), 'cue-nonnext-'));
    try {
      write(only, 'package.json', '{"scripts":{"next":"echo"}}\n');
      write(only, 'pages/x.tsx', 'export default () => null;\n');
      expect(nextAdapter.detect({ files: scanSource(only).files })).toBe(false);
    } finally {
      rmSync(only, { recursive: true, force: true });
    }
  });

  it('reads an OpenAPI document named by --openapi from outside the scanned tree', () => {
    write(
      project,
      'generated/api-docs.json',
      JSON.stringify({ openapi: '3.0.0', paths: { '/api/ping': { get: {} } } }),
    );
    const result = extract({
      projectRoot: project,
      sourceRoot: product,
      openapi: 'generated/api-docs.json',
    });
    expect(result.surface.some((e) => e.path === '/api/ping' && e.method === 'GET')).toBe(true);
  });

  it('says so when the named OpenAPI document is missing', () => {
    const result = extract({ projectRoot: project, sourceRoot: product, openapi: 'nope.json' });
    expect(result.gaps.some((g) => g.includes('nope.json'))).toBe(true);
  });

  it('reads the Playwright tests in the directory Cue runs in, not only in --source', () => {
    write(
      project,
      'tests/login.spec.ts',
      `import { test } from '@playwright/test';
// cue-route: /login
test('x', async ({ page }) => {
  await page.getByRole('button', { name: 'Log in' }).click();
});
`,
    );
    const result = extract({ projectRoot: project, sourceRoot: product });
    expect(result.adapters).toContain('existing-tests');
    expect(result.fromTests.locators).toBeGreaterThan(0);
  });
});

describe('laravel adapter', () => {
  it('reads routes, groups and resources, pointing at the controller action', () => {
    const app = mkdtempSync(join(tmpdir(), 'cue-laravel-'));
    try {
      write(app, 'composer.json', '{"require":{"laravel/framework":"^11"}}\n');
      write(
        app,
        'routes/web.php',
        `<?php
Route::get('/', [HomeController::class, 'index']);
Route::prefix('admin')->group(function () {
    Route::get('/users', 'UserController@list');
    Route::post('/users', [UserController::class, 'store']);
});
Route::get('/after', fn () => 'ok');
`,
      );
      write(
        app,
        'routes/api.php',
        `<?php
Route::apiResource('photos', PhotoController::class);
`,
      );
      write(
        app,
        'app/Http/Controllers/HomeController.php',
        '<?php\nclass HomeController {\n  public function index() {}\n}\n',
      );
      write(
        app,
        'app/Http/Controllers/UserController.php',
        '<?php\nclass UserController {\n  public function list() {}\n  public function store() {}\n}\n',
      );
      write(
        app,
        'app/Http/Controllers/PhotoController.php',
        '<?php\nclass PhotoController {\n  public function index() {}\n  public function show($photo) {}\n}\n',
      );

      const files = scanSource(app).files;
      expect(laravelAdapter.detect({ files })).toBe(true);
      const surface = laravelAdapter.extract({ files }).surface ?? [];
      const has = (kind: string, path: string, source: string, method?: string) =>
        surface.some(
          (e) => e.kind === kind && e.path === path && e.source === source && e.method === method,
        );

      expect(has('route', '/', 'app/Http/Controllers/HomeController.php:3')).toBe(true);
      expect(has('route', '/admin/users', 'app/Http/Controllers/UserController.php:3')).toBe(true);
      expect(
        has('endpoint', '/admin/users', 'app/Http/Controllers/UserController.php:4', 'POST'),
      ).toBe(true);
      // The group's prefix does not leak past its closing brace.
      expect(surface.some((e) => e.path === '/after')).toBe(true);
      expect(
        has('endpoint', '/api/photos', 'app/Http/Controllers/PhotoController.php:3', 'GET'),
      ).toBe(true);
      expect(
        has('endpoint', '/api/photos/{photo}', 'app/Http/Controllers/PhotoController.php:4', 'GET'),
      ).toBe(true);
      // The controller has no `store`, so the resource does not claim one.
      expect(surface.some((e) => e.method === 'POST' && e.path === '/api/photos')).toBe(false);
    } finally {
      rmSync(app, { recursive: true, force: true });
    }
  });
});
