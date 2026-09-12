import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshnessAdvice, freshnessOf } from '../src/agent-kb/freshness.js';
import { containsSensitive, redact } from '../src/agent-kb/redact.js';
import { formatLocatorAnswer, resolveLocator } from '../src/agent-kb/resolve-locator.js';
import {
  hashSnapshot,
  locatorFor,
  parseSnapshot,
  routeFromUrl,
  routeToFilename,
} from '../src/agent-kb/snapshot.js';
import { correlate, readRouteMap, writeRouteMap } from '../src/agent-kb/store.js';
import type { RouteMap } from '../src/schema/agent-kb.js';

/**
 * `.agent-kb` is where being wrong costs the most, so these tests are mostly
 * about refusal: refusing to answer without a source, to sound certain about a
 * stale entry, or to write anything sensitive into a committed directory.
 */

/** A real capture from `@playwright/cli`, not a format written from memory. */
const SNAPSHOT = readFileSync(join(import.meta.dirname, 'snapshots', 'login.txt'), 'utf8');

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'understudy-kb-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('parsing a real playwright-cli snapshot', () => {
  const parsed = parseSnapshot(SNAPSHOT);

  it('reads the page identity', () => {
    expect(parsed.url).toBe('http://localhost:8931/login');
    expect(parsed.title).toBe('Sign in');
  });

  it('keeps the addressable elements and drops the structural ones', () => {
    const roles = parsed.elements.map((e) => `${e.role} ${e.name ?? ''}`);
    expect(roles).toEqual([
      'heading Welcome back',
      'textbox Email',
      'textbox Password',
      'button Log in',
      'link Forgot password?',
    ]);
    // `main` and `generic` wrap everything and address nothing.
    expect(roles.some((r) => r.startsWith('generic'))).toBe(false);
    expect(roles.some((r) => r.startsWith('main'))).toBe(false);
  });

  it('collects outgoing links so the next route is discoverable', () => {
    expect(parsed.links).toEqual([{ name: 'Forgot password?', href: '/forgot' }]);
  });

  it('emits locators the constitution would accept', () => {
    // Storing CSS would launder a no-raw-selectors violation into the map.
    for (const element of parsed.elements) {
      expect(element.locator).toMatch(/^getByRole\(/);
    }
    expect(parsed.elements[3]?.locator).toBe("getByRole('button', { name: 'Log in' })");
    expect(parsed.elements[0]?.locator).toBe(
      "getByRole('heading', { name: 'Welcome back', level: 1 })",
    );
  });

  it('starts everything at runtime-only until the source confirms it', () => {
    expect(parsed.elements.every((e) => e.confidence === 'runtime-only')).toBe(true);
  });

  it('hashes the tree so drift is detectable without a diff', () => {
    expect(hashSnapshot(parsed.tree)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSnapshot(parsed.tree)).toBe(hashSnapshot(`${parsed.tree}\n`));
  });

  it('escapes a quote in an accessible name', () => {
    expect(locatorFor('button', "Save 'draft'")).toBe(
      "getByRole('button', { name: 'Save \\'draft\\'' })",
    );
  });
});

describe('routes', () => {
  it('keeps the path and drops the host, which belongs to the environment', () => {
    expect(routeFromUrl('https://staging.example.com/checkout/payment')).toBe('/checkout/payment');
    expect(routeFromUrl('https://example.com')).toBe('/');
  });

  it('makes a filename from a route', () => {
    expect(routeToFilename('/checkout/payment')).toBe('checkout-payment');
    expect(routeToFilename('/')).toBe('index');
  });
});

describe('freshness', () => {
  const now = new Date('2026-03-01T00:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  it.each([
    [1, 'fresh'],
    [8, 'ageing'],
    [40, 'stale'],
  ])('calls a %d-day-old entry %s', (days, expected) => {
    expect(freshnessOf(daysAgo(days), now)).toBe(expected);
  });

  it('treats an unparseable timestamp as stale, not as fresh', () => {
    // Failing towards caution is the whole point.
    expect(freshnessOf('not a date', now)).toBe('stale');
  });

  it('tells a stale entry not to speak confidently', () => {
    const advice = freshnessAdvice('stale', '/login');
    expect(advice).toContain('candidate, not a fact');
    expect(advice).toContain('understudy survey');
    expect(advice).toContain('confident voice');
  });
});

describe('redaction', () => {
  it.each([
    ['a token in a URL', 'https://x.test/cb?token=abc123def456ghi789'],
    ['a bearer header', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345'],
    ['a JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N'],
    ['an API key', 'sk-abcdefghijklmnopqrstuvwx'],
    ['a GitHub token', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['an email address', 'contact alice.smith@example.com for access'],
    ['an assigned secret', 'password: hunter2hunter2'],
  ])('removes %s', (_label, text) => {
    expect(containsSensitive(text)).toBe(true);
    expect(redact(text).text).toContain('«redacted:');
  });

  it('leaves ordinary page content alone', () => {
    const text = 'title: Sign in\nrole: button\nname: Log in';
    expect(containsSensitive(text)).toBe(false);
    expect(redact(text).text).toBe(text);
  });

  it('keeps the parameter name so the reader can see what went', () => {
    expect(redact('https://x.test/cb?token=abc123def456').text).toContain('?token=«redacted:');
  });
});

describe('the store', () => {
  const map: RouteMap = {
    schemaVersion: 1,
    route: '/login',
    title: 'Sign in',
    exploredAt: '2026-03-01T00:00:00.000Z',
    verifiedAt: '2026-03-01T00:00:00.000Z',
    snapshotHash: 'a'.repeat(64),
    elements: [
      {
        role: 'button',
        name: 'Log in',
        locator: "getByRole('button')",
        confidence: 'runtime-only',
      },
    ],
    links: [],
    gaps: [],
  };

  it('round-trips a route map', () => {
    writeRouteMap(root, map);
    const loaded = readRouteMap(root, '/login', new Date('2026-03-02T00:00:00Z'));
    expect(loaded?.map.route).toBe('/login');
    expect(loaded?.freshness).toBe('fresh');
  });

  it('redacts on the way in, because the directory is committed', () => {
    // Redacting at read time means the secret is already in git history.
    writeRouteMap(root, { ...map, title: 'Welcome sk-abcdefghijklmnopqrstuvwx' });
    const written = readFileSync(join(root, '.agent-kb/app-map/login.yaml'), 'utf8');
    expect(written).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(written).toContain('«redacted:api-key»');
  });

  it('carries the lifecycle rule in the file itself', () => {
    writeRouteMap(root, map);
    const written = readFileSync(join(root, '.agent-kb/app-map/login.yaml'), 'utf8');
    expect(written).toContain('not a fact to use');
  });
});

describe('correlation between the two sources', () => {
  const elements = parseSnapshot(SNAPSHOT).elements;

  it('confirms an element the product source also knows about', () => {
    // Neither source alone proves a test id is real *and* reachable.
    const matched = correlate(elements, {
      schemaVersion: 1,
      testIds: [{ testId: 'log-in', source: 'src/Login.tsx:42' }],
    }).find((e) => e.name === 'Log in');
    expect(matched?.confidence).toBe('confirmed');
    expect(matched?.testId).toBe('log-in');
  });

  it('matches a test id qualified by its area', () => {
    // `login-submit`, not `login`, is how test ids are actually written. Demanding
    // the whole id equal the name made `confirmed` unreachable in practice.
    const button = correlate(elements, {
      schemaVersion: 1,
      testIds: [{ testId: 'login-submit', source: 'src/Login.tsx:42' }],
    }).find((e) => e.name === 'Log in');
    expect(button?.confidence).toBe('confirmed');
    expect(button?.testId).toBe('login-submit');
  });

  it('matches whole segments, never substrings', () => {
    const button = correlate(elements, {
      schemaVersion: 1,
      testIds: [{ testId: 'blogin-banner', source: 'src/Blog.tsx:9' }],
    }).find((e) => e.name === 'Log in');
    expect(button?.confidence).toBe('runtime-only');
  });

  it('refuses to guess when two test ids match equally well', () => {
    // A confident wrong selector is worse than an admitted gap.
    const ambiguous = correlate(elements, {
      schemaVersion: 1,
      testIds: [
        { testId: 'login-submit', source: 'src/Login.tsx:42' },
        { testId: 'signup-login-link', source: 'src/Signup.tsx:8' },
      ],
    }).find((e) => e.name === 'Log in');
    expect(ambiguous?.confidence).toBe('runtime-only');
    expect(ambiguous?.testId).toBeUndefined();
  });

  it('leaves everything runtime-only when there is no product extract', () => {
    expect(correlate(elements, undefined).every((e) => e.confidence === 'runtime-only')).toBe(true);
  });
});

describe('resolving a locator', () => {
  function seed(verifiedAt = new Date().toISOString()): void {
    mkdirSync(join(root, '.agent-kb/app-map'), { recursive: true });
    const parsed = parseSnapshot(SNAPSHOT);
    writeRouteMap(root, {
      schemaVersion: 1,
      route: '/login',
      title: parsed.title,
      exploredAt: verifiedAt,
      verifiedAt,
      snapshotHash: hashSnapshot(parsed.tree),
      elements: [...parsed.elements],
      links: [...parsed.links],
      gaps: [],
    });
  }

  it('finds an element that was surveyed', () => {
    seed();
    const answer = resolveLocator({ projectRoot: root, query: 'log in button' });
    expect(answer.kind).toBe('found');
    if (answer.kind !== 'found') return;
    expect(answer.element.locator).toBe("getByRole('button', { name: 'Log in' })");
    expect(answer.route).toBe('/login');
  });

  it('refuses to invent one for an element nobody surveyed', () => {
    seed();
    // Regression: role alone used to score, so "delete account button" returned
    // the first button on the page.
    const answer = resolveLocator({ projectRoot: root, query: 'delete account button' });
    expect(answer.kind).toBe('unknown');
    expect(formatLocatorAnswer(answer)).toContain('Do not guess a selector');
    expect(formatLocatorAnswer(answer)).toContain('understudy survey');
  });

  it('says what it does know, so the gap is actionable', () => {
    seed();
    const answer = resolveLocator({ projectRoot: root, query: 'nonexistent thing' });
    if (answer.kind !== 'unknown') throw new Error('expected unknown');
    expect(answer.knownRoutes).toEqual(['/login']);
  });

  it('reports an empty knowledge base as empty rather than as a miss', () => {
    const answer = resolveLocator({ projectRoot: root, query: 'anything' });
    expect(formatLocatorAnswer(answer)).toContain('Nothing has been surveyed yet');
  });

  it('hedges on a stale entry instead of answering plainly', () => {
    seed(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString());
    const answer = resolveLocator({ projectRoot: root, query: 'log in button' });
    expect(answer.kind).toBe('found');
    if (answer.kind !== 'found') return;
    expect(answer.freshness).toBe('stale');
    expect(formatLocatorAnswer(answer)).toContain('candidate, not a fact');
  });

  it('states why a runtime-only selector is less trustworthy', () => {
    seed();
    const text = formatLocatorAnswer(resolveLocator({ projectRoot: root, query: 'log in button' }));
    expect(text).toContain('runtime-only');
    expect(text).toContain('absent from the product source');
  });
});
