import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MARKDOWN_YAML_V1,
  parseRawSnapshot,
  parseSnapshot,
  UnsupportedSnapshotFormatError,
} from '../src/agent-kb/snapshot/index.js';

/**
 * The fixtures are what a real `playwright-cli` printed, captured by
 * scripts/capture-snapshots.mjs into a directory named for its version. A new
 * CLI release adds a directory next to the old one, so these tests keep proving
 * the old format still parses at the same time as they prove the new one does.
 */

const SNAPSHOTS = join(import.meta.dirname, 'snapshots');
const versions = readdirSync(SNAPSHOTS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('playwright-cli@'))
  .map((entry) => entry.name);

function load(version: string, page: string) {
  const text = readFileSync(join(SNAPSHOTS, version, `${page}.txt`), 'utf8');
  return parseRawSnapshot({
    text,
    cliVersion: version.replace('playwright-cli@', ''),
    capturedAt: '2026-10-01T00:00:00.000Z',
  });
}

const names = (observation: ReturnType<typeof load>) =>
  observation.elements.map((element) => `${element.role}:${element.name ?? ''}`);

it('has fixtures from at least one real CLI version', () => {
  expect(versions.length).toBeGreaterThan(0);
});

describe.each(versions)('%s', (version) => {
  it.each(['login', 'signup', 'items', 'dashboard', 'admin-security'])(
    'parses %s with no warnings, as the v1 format',
    (page) => {
      const observation = load(version, page);
      expect(observation.format).toBe(MARKDOWN_YAML_V1);
      expect(observation.warnings).toEqual([]);
      expect(observation.tree.length).toBeGreaterThan(0);
      expect(observation.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);
    },
  );

  it('finds the login form', () => {
    const login = load(version, 'login');
    expect(login.title).toBe('Sign in');
    expect(names(login)).toEqual([
      'heading:Sign in',
      'textbox:Email',
      'textbox:Password',
      'button:Log in',
      'link:Forgot password?',
    ]);
    expect(login.links).toEqual([{ name: 'Forgot password?', href: '/forgot' }]);
  });

  it('finds the late welcome heading once the page has settled', () => {
    expect(names(load(version, 'dashboard'))).toContain('heading:Welcome back, Sam');
  });

  it('keeps frame-prefixed refs and [active] markers out of the way', () => {
    const security = load(version, 'admin-security');
    expect(names(security)).toContain('button:Change password');
    expect(security.links.map((link) => link.href)).toContain('/admin/settings/security');
  });

  it('gives the same hash input for the same page', () => {
    expect(load(version, 'login').tree).toBe(load(version, 'login').tree);
  });
});

describe('formats that are not understood', () => {
  const raw = (text: string, cliVersion?: string) => ({
    text,
    capturedAt: '2026-10-01T00:00:00.000Z',
    ...(cliVersion === undefined ? {} : { cliVersion }),
  });

  it('throws for text with no page header', () => {
    expect(() => parseRawSnapshot(raw('hello'))).toThrow(UnsupportedSnapshotFormatError);
  });

  it('throws for a page header with no yaml block', () => {
    expect(() =>
      parseRawSnapshot(raw('### Page\n- Page URL: http://x.test\n### Snapshot\n```json\n{}\n```')),
    ).toThrow(UnsupportedSnapshotFormatError);
  });

  it('names the CLI version, the supported formats and the way out', () => {
    expect.assertions(3);
    try {
      parseRawSnapshot(raw('<html></html>', '9.9.9'));
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('playwright-cli 9.9.9');
      expect(message).toContain(MARKDOWN_YAML_V1);
      expect(message).toContain('--from');
    }
  });

  it('keeps parseSnapshot strict too', () => {
    expect(() => parseSnapshot('')).toThrow(UnsupportedSnapshotFormatError);
  });
});

describe('lines the parser does not understand', () => {
  const page = (lines: string[]) =>
    `### Page\n- Page URL: http://x.test/a\n- Page Title: A\n### Snapshot\n\`\`\`yaml\n${lines.join('\n')}\n\`\`\`\n`;
  const parse = (lines: string[]) =>
    parseRawSnapshot({ text: page(lines), capturedAt: '2026-10-01T00:00:00.000Z' });

  it('reports them as warnings and still reads the rest', () => {
    const observation = parse(['- button "Save" [ref=e1]', '<<< something new >>>']);
    expect(names(observation)).toEqual(['button:Save']);
    expect(observation.warnings).toEqual(['Unrecognised line: <<< something new >>>']);
  });

  it('caps the warnings and says how many were left out', () => {
    const observation = parse(Array.from({ length: 9 }, (_, index) => `!!! ${String(index)}`));
    expect(observation.warnings).toHaveLength(6);
    expect(observation.warnings.at(-1)).toBe('…and 4 more unrecognised line(s).');
  });

  it('yields an empty tree, not an error, for a page with nothing in it', () => {
    const observation = parse([]);
    expect(observation.tree).toBe('');
    expect(observation.elements).toEqual([]);
  });
});
