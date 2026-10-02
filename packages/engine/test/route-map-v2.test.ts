import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { loadKnowledge } from '../src/agent-kb/load-knowledge.js';
import { UnsupportedSchemaVersionError, recordLiveCheck } from '../src/agent-kb/route-map-file.js';
import { readAllRouteMapsWithErrors, readRouteMap, writeRouteMap } from '../src/agent-kb/store.js';
import { indexKnowledge, validateKnowledge } from '../src/knowledge/index.js';
import type { KbElement, RouteMap } from '../src/schema/agent-kb.js';

/**
 * Version 2 route maps say what each element rests on. These tests pin the three
 * promises that make the format safe to change: old files still read, what is
 * written reads back identically, and a file from the future is refused.
 */

const NOW = new Date('2026-10-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number): string => new Date(NOW.getTime() - days * DAY).toISOString();

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cue-v2-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}
const text = (path: string): string => readFileSync(join(root, path), 'utf8');

const el = (
  name: string,
  confidence: KbElement['confidence'],
  extra: Partial<KbElement> = {},
): KbElement => ({
  role: 'button',
  name,
  locator: `getByRole('button', { name: '${name}' })`,
  confidence,
  ...extra,
});

const map = (elements: KbElement[], extra: Partial<RouteMap> = {}): RouteMap => ({
  schemaVersion: 2,
  route: '/login',
  title: 'Sign in',
  exploredAt: ago(2),
  verifiedAt: ago(2),
  snapshotHash: 'hash-1',
  elements,
  links: [],
  gaps: [],
  ...extra,
});

const testIds = (): string =>
  stringify({
    schemaVersion: 1,
    commit: 'abc123',
    testIds: [{ testId: 'login-submit', source: 'src/Login.tsx:12' }],
  });
const sources = (): string =>
  JSON.stringify({
    schemaVersion: 1,
    source: '/p',
    extractedAt: ago(3),
    adapters: [],
    files: [{ path: 'src/Login.tsx', hash: 'filehash' }],
    gaps: [],
  });

const LOGIN = '.agent-kb/app-map/login.yaml';

describe('what is written', () => {
  it('is version 2, with evidence and a status on every element', () => {
    writeRouteMap(root, map([el('Log in', 'runtime-only')], { environment: 'staging' }));
    const file = parse(text(LOGIN)) as {
      schemaVersion: number;
      environment: string;
      evidence: { id: string; type: string; environment?: string }[];
      elements: { id: string; status: string; evidence: string[] }[];
    };

    expect(file.schemaVersion).toBe(2);
    expect(file.environment).toBe('staging');
    expect(file.elements[0]).toMatchObject({
      id: 'locator:/login#button:log in',
      status: 'observed',
    });
    const cited = file.elements[0]?.evidence ?? [];
    expect(cited).toHaveLength(1);
    expect(file.evidence.find((e) => e.id === cited[0])).toMatchObject({
      type: 'browser',
      environment: 'staging',
    });
  });

  it('records the tool that made the observation', () => {
    writeRouteMap(
      root,
      map([el('Log in', 'runtime-only')], {
        tool: {
          name: 'playwright-cli',
          version: '0.1.22',
          format: 'playwright-cli/markdown-yaml@1',
        },
      }),
    );
    expect(text(LOGIN)).toContain('version: 0.1.22');
    expect(text(LOGIN)).toContain('format: playwright-cli/markdown-yaml@1');
  });

  it('cites the product source, and what the element depends on, when a test id confirms it', () => {
    write('.agent-kb/product/testids.yaml', testIds());
    write('.agent-kb/product/sources.json', sources());
    writeRouteMap(root, map([el('Log in', 'confirmed', { testId: 'login-submit' })]));

    const file = parse(text(LOGIN)) as {
      evidence: { id: string; type: string; file?: string; line?: number; commit?: string }[];
      elements: { status: string; evidence: string[]; dependencies: unknown }[];
    };
    const element = file.elements[0];
    expect(element?.status).toBe('verified');
    expect(element?.dependencies).toEqual({ files: [{ path: 'src/Login.tsx', hash: 'filehash' }] });
    const source = file.evidence.find((e) => e.type === 'source-code');
    expect(source).toMatchObject({ file: 'src/Login.tsx', line: 12, commit: 'abc123' });
    expect(element?.evidence).toContain(source?.id);
  });

  it('never writes a host, in the route, the evidence or anywhere else', () => {
    writeRouteMap(root, map([el('Log in', 'runtime-only')], { environment: 'staging' }));
    expect(text(LOGIN)).not.toMatch(/https?:\/\//);
  });

  it('keeps the header that tells a reader how to treat a stale entry', () => {
    writeRouteMap(root, map([el('Log in', 'runtime-only')]));
    expect(text(LOGIN)).toContain('not a fact to use');
  });

  it('redacts a secret in an element name before it reaches the file', () => {
    writeRouteMap(root, map([el('token=sk_live_abcdefghijklmnop1234', 'runtime-only')]));
    expect(text(LOGIN)).not.toContain('sk_live_abcdefghijklmnop1234');
  });
});

describe('round trip', () => {
  it('reads back what was written, and writing that again changes nothing', () => {
    write('.agent-kb/product/testids.yaml', testIds());
    writeRouteMap(
      root,
      map([el('Log in', 'confirmed', { testId: 'login-submit' }), el('Cancel', 'runtime-only')], {
        environment: 'staging',
        tool: { name: 'playwright-cli', version: '0.1.22' },
      }),
    );
    const first = text(LOGIN);

    const loaded = readRouteMap(root, '/login', NOW);
    if (loaded === undefined) throw new Error('map should exist');
    expect(loaded.fileVersion).toBe(2);
    expect(loaded.map.elements.map((e) => [e.name, e.status, e.confidence])).toEqual([
      ['Log in', 'verified', 'confirmed'],
      ['Cancel', 'observed', 'runtime-only'],
    ]);

    writeRouteMap(root, loaded.map);
    expect(text(LOGIN)).toBe(first);
  });

  it('loads into a knowledge base the model accepts, with the evidence intact', () => {
    write('.agent-kb/product/testids.yaml', testIds());
    writeRouteMap(root, map([el('Log in', 'confirmed', { testId: 'login-submit' })]));

    const { kb, issues } = loadKnowledge(root, NOW);
    expect(issues).toEqual([]);
    expect(validateKnowledge(kb)).toEqual([]);

    const index = indexKnowledge(kb);
    const fact = index.allLocators()[0];
    if (fact === undefined) throw new Error('expected a locator');
    expect(fact).toMatchObject({ status: 'verified', testId: 'login-submit' });
    expect(index.evidenceFor(fact.id).map((e) => e.type)).toEqual(['browser', 'source-code']);
    expect(index.coverage(fact)).toBe('confirmed');
  });
});

describe('reading version 1', () => {
  const v1 = (elements: unknown[]) =>
    stringify({
      schemaVersion: 1,
      route: '/login',
      title: 'Sign in',
      exploredAt: ago(2),
      verifiedAt: ago(2),
      snapshotHash: 'hash-1',
      elements,
      links: [],
      gaps: [],
    });
  const v1el = (name: string, confidence: string, testId?: string) => ({
    role: 'button',
    name,
    locator: `getByRole('button', { name: '${name}' })`,
    confidence,
    ...(testId === undefined ? {} : { testId }),
  });

  it('migrates in memory and leaves the file exactly as it was', () => {
    write(LOGIN, v1([v1el('Log in', 'runtime-only')]));
    const before = text(LOGIN);

    const loaded = readRouteMap(root, '/login', NOW);
    expect(loaded?.fileVersion).toBe(1);
    expect(loaded?.map.elements[0]).toMatchObject({
      id: 'locator:/login#button:log in',
      status: 'observed',
      confidence: 'runtime-only',
    });
    expect(loaded?.map.evidence?.map((e) => e.type)).toEqual(['browser', 'import']);
    expect(text(LOGIN)).toBe(before);
  });

  it('keeps the strength of each old claim and no more', () => {
    write('.agent-kb/product/testids.yaml', testIds());
    write(
      LOGIN,
      v1([
        v1el('Log in', 'confirmed', 'login-submit'),
        v1el('Hand-confirmed', 'confirmed'),
        v1el('Seen', 'runtime-only'),
        v1el('Read', 'code-only'),
        v1el('Mystery', 'unknown'),
      ]),
    );
    const elements = readRouteMap(root, '/login', NOW)?.map.elements ?? [];
    const named = (name: string) => elements.find((e) => e.name === name);
    expect(named('Log in')).toMatchObject({ status: 'verified', confidence: 'confirmed' });
    // `confirmed` with no source reference to cite rests on the file's own word.
    expect(named('Hand-confirmed')).toMatchObject({ status: 'verified' });
    expect(named('Seen')).toMatchObject({ status: 'observed', confidence: 'runtime-only' });
    expect(named('Read')).toMatchObject({ status: 'inferred', confidence: 'unknown' });
    expect(named('Mystery')).toMatchObject({ status: 'inferred', confidence: 'unknown' });
  });

  it('is saved as version 2 the next time something writes it', () => {
    write(LOGIN, v1([v1el('Log in', 'runtime-only')]));
    const loaded = readRouteMap(root, '/login', NOW);
    if (loaded === undefined) throw new Error('map should exist');
    writeRouteMap(root, loaded.map);

    const saved = parse(text(LOGIN)) as { schemaVersion: number; elements: { status: string }[] };
    expect(saved.schemaVersion).toBe(2);
    expect(saved.elements[0]?.status).toBe('observed');
    expect(readRouteMap(root, '/login', NOW)?.fileVersion).toBe(2);
  });

  it('loads into a valid knowledge base, as before', () => {
    write(LOGIN, v1([v1el('Log in', 'runtime-only')]));
    const { kb, issues } = loadKnowledge(root, NOW);
    expect(issues).toEqual([]);
    expect(validateKnowledge(kb)).toEqual([]);
  });
});

describe('a version this Cue does not know', () => {
  it('is refused with an instruction to upgrade, and named in the listing', () => {
    write(LOGIN, stringify({ schemaVersion: 3, route: '/login', anything: 'new' }));

    expect(() => readRouteMap(root, '/login', NOW)).toThrow(UnsupportedSchemaVersionError);
    expect(() => readRouteMap(root, '/login', NOW)).toThrow(/Upgrade @wiluszdamian\/cue/);

    const reading = readAllRouteMapsWithErrors(root, NOW);
    expect(reading.maps).toEqual([]);
    expect(reading.invalid).toHaveLength(1);
    expect(reading.invalid[0]?.reason).toContain('schema version 3');
  });

  it('is not overwritten by being surveyed again without being read', () => {
    // The reader refuses; a survey writes a fresh map from a snapshot, which is the
    // user's explicit act, so the only protection here is that nothing *reads* it wrongly.
    write(LOGIN, stringify({ schemaVersion: 3, route: '/login' }));
    const { issues } = loadKnowledge(root, NOW);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('error');
  });
});

describe('recording a live check', () => {
  function written(): RouteMap {
    write('.agent-kb/product/testids.yaml', testIds());
    writeRouteMap(
      root,
      map([el('Log in', 'confirmed', { testId: 'login-submit' }), el('Cancel', 'runtime-only')], {
        environment: 'staging',
        exploredAt: ago(40),
        verifiedAt: ago(40),
      }),
    );
    const loaded = readRouteMap(root, '/login', NOW);
    if (loaded === undefined) throw new Error('map should exist');
    return loaded.map;
  }

  it('confirms an unchanged page now, replacing the old observation instead of piling up', () => {
    const before = written();
    const after = recordLiveCheck(before, {
      at: NOW,
      snapshotHash: before.snapshotHash,
      missing: new Set(),
      environment: 'staging',
    });
    writeRouteMap(root, after);

    const saved = parse(text(LOGIN)) as {
      verifiedAt: string;
      evidence: { type: string; observedAt?: string }[];
      elements: { status: string; verifiedAt: string; evidence: string[] }[];
    };
    expect(saved.verifiedAt).toBe(NOW.toISOString());
    expect(saved.elements.every((e) => e.verifiedAt === NOW.toISOString())).toBe(true);
    // One browser observation per environment, the latest; the source reference stays.
    expect(saved.evidence.filter((e) => e.type === 'browser')).toHaveLength(1);
    expect(saved.evidence.find((e) => e.type === 'browser')?.observedAt).toBe(NOW.toISOString());
    expect(saved.evidence.filter((e) => e.type === 'source-code')).toHaveLength(1);
    expect(saved.elements[0]).toMatchObject({ status: 'verified' });
  });

  it('keeps an element the page lost, marked stale, and confirms nothing', () => {
    const before = written();
    const lost = before.elements.find((e) => e.name === 'Cancel');
    const after = recordLiveCheck(before, {
      at: NOW,
      snapshotHash: 'a-different-hash',
      missing: new Set([lost?.id ?? '']),
    });
    writeRouteMap(root, after);

    const saved = parse(text(LOGIN)) as {
      verifiedAt: string;
      elements: { name: string; status: string; verifiedAt: string }[];
    };
    expect(saved.elements.find((e) => e.name === 'Cancel')?.status).toBe('stale');
    // The page drifted, so the route is not "verified now" and neither is the survivor.
    expect(saved.verifiedAt).toBe(before.verifiedAt);
    expect(saved.elements.find((e) => e.name === 'Log in')?.verifiedAt).toBe(before.verifiedAt);

    const { kb } = loadKnowledge(root, NOW);
    const index = indexKnowledge(kb);
    const cancel = index.allLocators().find((l) => l.name === 'Cancel');
    expect(cancel?.status).toBe('stale');
    expect(cancel && index.coverage(cancel)).toBe('unknown');
  });

  it('brings a stale element back as observed once the page shows it again', () => {
    const before = written();
    const lost = before.elements.find((e) => e.name === 'Cancel');
    const stale = recordLiveCheck(before, {
      at: new Date(NOW.getTime() - DAY),
      snapshotHash: 'x',
      missing: new Set([lost?.id ?? '']),
    });
    const back = recordLiveCheck(stale, {
      at: NOW,
      snapshotHash: stale.snapshotHash,
      missing: new Set(),
    });
    expect(back.elements.find((e) => e.name === 'Cancel')?.status).toBe('observed');
  });
});
