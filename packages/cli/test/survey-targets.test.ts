import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extract, readRouteMap } from '@wiluszdamian/cue-engine';
import { survey, type CaptureResult, type SnapshotDriver } from '../src/survey.js';
import {
  formatPlan,
  formatResults,
  parseBaseUrl,
  surveyTargets,
  targetsExitCode,
} from '../src/survey-targets.js';

/**
 * Looking at a few pages again rather than all of them. The pages are real snapshots
 * a playwright-cli printed; the application is a function from a path to one.
 */

const SNAPSHOTS = join(import.meta.dirname, '..', '..', 'engine', 'test', 'snapshots');
const real = (page: string): string =>
  readFileSync(join(SNAPSHOTS, 'playwright-cli@0.1.22', `${page}.txt`), 'utf8');

const BASE = 'http://staging.test';
const app = (pages: Record<string, string>): SnapshotDriver & { opened: string[] } => {
  const opened: string[] = [];
  return {
    opened,
    capture(url): CaptureResult {
      opened.push(url);
      const page = pages[new URL(url).pathname];
      return page === undefined
        ? { ok: false, reason: `Timeout opening ${url}` }
        : { ok: true, output: page };
    },
  };
};

let project: string;
beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'cue-targets-'));
});
afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

const surveyed = (name: string, path: string): void => {
  survey({ projectRoot: project, url: `${BASE}${path}`, driver: app({ [path]: real(name) }) });
};

describe('surveying chosen pages', () => {
  beforeEach(() => {
    surveyed('login', '/login');
    surveyed('signup', '/signup');
  });

  it('opens only the pages in the plan, joined to the address', () => {
    const driver = app({ '/login': real('login') });
    const results = surveyTargets({
      projectRoot: project,
      baseUrl: BASE,
      driver,
      targets: [{ route: '/login', reasons: ['asked for'] }],
    });
    expect(driver.opened).toEqual([`${BASE}/login`]);
    expect(results).toEqual([{ route: '/login', outcome: 'unchanged' }]);
  });

  it('says updated when the page is not as it was, and writes what it found', () => {
    // The sign-up page now answers where /login used to be.
    const results = surveyTargets({
      projectRoot: project,
      baseUrl: BASE,
      driver: app({ '/login': real('signup') }),
      targets: [{ route: '/login', reasons: ['asked for'] }],
    });
    expect(results[0]?.outcome).toBe('updated');
  });

  it('surveys a page nobody has surveyed, which is how one is first surveyed', () => {
    const results = surveyTargets({
      projectRoot: project,
      baseUrl: BASE,
      driver: app({ '/items': real('items') }),
      targets: [{ route: '/items', reasons: ['asked for'] }],
    });
    expect(results[0]?.outcome).toBe('updated');
    expect(readRouteMap(project, '/items')).toBeDefined();
  });

  it('carries on past a page that fails, and says which and why', () => {
    const driver = app({ '/signup': real('signup') });
    const results = surveyTargets({
      projectRoot: project,
      baseUrl: BASE,
      driver,
      targets: [
        { route: '/gone', reasons: ['asked for'] },
        { route: '/signup', reasons: ['asked for'] },
      ],
    });
    expect(results.map((r) => [r.route, r.outcome])).toEqual([
      ['/gone', 'failed'],
      ['/signup', 'unchanged'],
    ]);
    expect(results[0]?.detail).toContain('Could not explore');
    expect(targetsExitCode(results)).toBe(1);
  });

  it('does not open a page it was told to skip', () => {
    const driver = app({});
    const results = surveyTargets({
      projectRoot: project,
      baseUrl: BASE,
      driver,
      targets: [{ route: '/items/[id]', reasons: ['asked for'], skip: 'needs a real value' }],
    });
    expect(driver.opened).toEqual([]);
    expect(results).toEqual([
      { route: '/items/[id]', outcome: 'skipped', detail: 'needs a real value' },
    ]);
    // A skipped page is a choice, not a failure.
    expect(targetsExitCode(results)).toBe(0);
  });

  it('reports where a page really ended up, when the application sent it elsewhere', () => {
    const results = surveyTargets({
      projectRoot: project,
      baseUrl: BASE,
      // /admin redirects to the login page; the snapshot says so in its Page URL.
      driver: app({ '/admin': real('login').replace('4399/login', '4399/login') }),
      targets: [{ route: '/admin', reasons: ['asked for'] }],
    });
    expect(results[0]?.outcome).toBe('updated');
    expect(results[0]?.detail).toContain('sent it to /login');
  });

  it('never writes the address into the knowledge base', () => {
    surveyTargets({
      projectRoot: project,
      baseUrl: BASE,
      driver: app({ '/login': real('login') }),
      targets: [{ route: '/login', reasons: ['asked for'] }],
      environment: 'staging',
    });
    const dir = join(project, '.agent-kb');
    const all = (path: string): string[] =>
      readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? all(join(path, entry.name)) : [join(path, entry.name)],
      );
    for (const file of all(dir)) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('staging.test');
    }
  });
});

describe('the plan and the result as text', () => {
  it('lists every page with its reasons, lined up', () => {
    const text = formatPlan(
      [
        {
          route: '/login',
          reasons: [
            'not confirmed for 45 days',
            'src/Login.tsx changed since it was confirmed (2026-09-01)',
          ],
        },
        { route: '/items/[id]', reasons: ['asked for'], skip: 'needs a real value' },
      ],
      BASE,
    );
    expect(text).toContain(`Survey plan: 2 route(s) against ${BASE}`);
    expect(text).toContain('  /login       not confirmed for 45 days');
    expect(text).toContain(`${' '.repeat(15)}src/Login.tsx changed since it was confirmed`);
    expect(text).toContain('  /items/[id]  skipped — needs a real value');
  });

  it('counts each outcome', () => {
    const text = formatResults([
      { route: '/a', outcome: 'updated' },
      { route: '/b', outcome: 'unchanged' },
      { route: '/c', outcome: 'failed', detail: 'boom' },
      { route: '/d', outcome: 'skipped', detail: 'dynamic' },
    ]);
    expect(text).toContain('FAILED    /c — boom');
    expect(text).toContain('1 updated, 1 unchanged, 1 failed, 1 skipped.');
  });
});

describe('the address', () => {
  it('is an http or https URL, without a trailing slash', () => {
    expect(parseBaseUrl('https://staging.example.com/')).toEqual({
      ok: true,
      url: 'https://staging.example.com',
    });
    expect(parseBaseUrl('http://localhost:3000')).toEqual({
      ok: true,
      url: 'http://localhost:3000',
    });
  });

  it('is refused when it is something else, saying what it was', () => {
    expect(parseBaseUrl('staging')).toEqual({ ok: false, reason: '"staging" is not an address' });
    expect(parseBaseUrl('file:///etc/passwd')).toEqual({
      ok: false,
      reason: '"file:///etc/passwd" is not an http or https address',
    });
  });
});

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

describe.skipIf(!existsSync(CLI))('the built command', () => {
  /** A project with one old page and, behind it, a product repository. */
  function seeded(): { product: string } {
    const product = mkdtempSync(join(tmpdir(), 'cue-targets-product-'));
    mkdirSync(join(product, 'app'), { recursive: true });
    writeFileSync(
      join(product, 'app', 'Login.tsx'),
      '<button data-testid="login-submit">Log in</button>\n',
    );
    extract({ projectRoot: project, sourceRoot: product });
    survey({
      projectRoot: project,
      url: `${BASE}/login`,
      driver: app({ '/login': real('login') }),
      now: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    });
    return { product };
  }

  const run = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'survey', '--cwd', project, ...args], {
      encoding: 'utf8',
      input: '',
      env: { ...process.env, CUE_BASE_URL: '' },
    });

  it('shows the plan and opens nothing with --dry-run', () => {
    const { product } = seeded();
    try {
      const result = run('--stale', '--base-url', BASE, '--dry-run');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Survey plan: 1 route(s)');
      expect(result.stdout).toContain('/login');
      expect(result.stdout).toContain('not confirmed for 60 days');
      expect(result.stdout).toContain('Dry run: nothing was opened or written.');
    } finally {
      rmSync(product, { recursive: true, force: true });
    }
  });

  it('needs the address of the environment, and says where to give it', () => {
    seeded();
    const result = run('--stale');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--base-url <url>');
    expect(result.stderr).toContain('CUE_BASE_URL');
  });

  it('takes the address from the environment', () => {
    seeded();
    const result = spawnSync(
      process.execPath,
      [CLI, 'survey', '--cwd', project, '--stale', '--dry-run'],
      {
        encoding: 'utf8',
        env: { ...process.env, CUE_BASE_URL: BASE },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`against ${BASE}`);
  });

  it('refuses something that is not an address', () => {
    expect(run('--route', '/login', '--base-url', 'staging').status).toBe(2);
  });

  it('refuses a URL together with a selector, rather than guessing which was meant', () => {
    const result = run(`${BASE}/login`, '--stale', '--base-url', BASE);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('a URL or one of --route, --stale and --affected-by, not both');
  });

  it('refuses --from with a selector', () => {
    expect(run('--route', '/login', '--base-url', BASE, '--from', 'x.txt').status).toBe(2);
  });

  it('says --action is not implemented yet', () => {
    const result = run('--action', 'settings.password.change');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not implemented yet');
  });

  it('says what it needs when given nothing at all', () => {
    const result = run();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--route /login, --stale, or --affected-by');
  });

  it('says there is nothing to do, rather than opening a browser for nothing', () => {
    surveyedFresh();
    const result = run('--stale', '--base-url', BASE);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Nothing to survey');
  });

  function surveyedFresh(): void {
    surveyed('login', '/login');
  }

  it('needs the product to read git history for --affected-by', () => {
    seeded();
    const result = run(
      '--affected-by',
      'HEAD~1..HEAD',
      '--base-url',
      BASE,
      '--source',
      join(project, 'nowhere'),
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('pass --source');
  });

  it('plans the pages whose source changed over a git range', () => {
    const { product } = seeded();
    try {
      const git = (...args: string[]): void => {
        const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
          cwd: product,
          encoding: 'utf8',
        });
        if (r.status !== 0) throw new Error(r.stderr);
      };
      git('init', '-q');
      git('add', '.');
      git('commit', '-q', '-m', 'one');
      writeFileSync(
        join(product, 'app', 'Login.tsx'),
        '<button data-testid="login-submit">Sign in</button>\n',
      );
      git('add', '.');
      git('commit', '-q', '-m', 'two');

      const result = run(
        '--affected-by',
        'HEAD~1..HEAD',
        '--base-url',
        BASE,
        '--source',
        product,
        '--dry-run',
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('/login');
      expect(result.stdout).toContain('changed: app/Login.tsx');
    } finally {
      rmSync(product, { recursive: true, force: true });
    }
  });

  it('reports a git range git does not know', () => {
    const { product } = seeded();
    try {
      const result = run('--affected-by', 'no..such', '--base-url', BASE, '--source', product);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('git diff no..such failed');
    } finally {
      rmSync(product, { recursive: true, force: true });
    }
  });
});
