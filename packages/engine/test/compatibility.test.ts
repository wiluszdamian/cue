import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  describeUpstreamDrift,
  isReadableRange,
  judgeVersions,
  loadCompatibility,
  parseCompatibility,
  satisfies,
} from '../src/index.js';
import { MARKDOWN_YAML_V1 } from '../src/agent-kb/snapshot/index.js';

const REPO = join(import.meta.dirname, '..', '..', '..');
const compatibility = loadCompatibility(join(REPO, 'compatibility.yaml'));

describe('ranges', () => {
  it.each([
    ['0.1.22', '>=0.1.22 <0.2.0', true],
    ['0.1.21', '>=0.1.22 <0.2.0', false],
    ['0.2.0', '>=0.1.22 <0.2.0', false],
    ['0.1.99', '>=0.1.22 <0.2.0', true],
    ['1.63.0', '>=1.63.0 <2.0.0', true],
    ['2.0.0', '>=1.63.0 <2.0.0', false],
    ['1.0.0', '1.0.0', true],
    ['1.0.1', '1.0.0', false],
    ['3.0.0', '>=1.0.0 <2.0.0 || >=3.0.0', true],
    ['2.5.0', '>=1.0.0 <2.0.0 || >=3.0.0', false],
    ['10.0.0', '>=9.0.0', true],
  ])('%s in "%s" is %s', (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });

  it('does not judge a pre-release compatible', () => {
    expect(satisfies('0.1.30-beta.1', '>=0.1.22 <0.2.0')).toBe(false);
  });

  it('refuses a range it cannot read instead of guessing', () => {
    expect(isReadableRange('^1.2.3')).toBe(false);
    expect(isReadableRange('>=1.0.0 <2.0.0')).toBe(true);
    expect(() => satisfies('1.0.0', '^1.2.3')).toThrow(/cannot read/);
  });

  it('compares numerically, not as text', () => {
    expect(compareVersions('0.1.9', '0.1.10')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });
});

describe('compatibility.yaml', () => {
  it('is valid, and lists the tools Understudy composes', () => {
    expect(Object.keys(compatibility.tools)).toEqual(
      expect.arrayContaining(['@playwright/cli', '@playwright/mcp', '@playwright/test']),
    );
  });

  it('rejects a tested version outside its range', () => {
    expect(() =>
      parseCompatibility(
        "schemaVersion: 1\nnode: '22'\ntools:\n  x: { range: '>=1.0.0 <2.0.0', tested: '3.0.0', role: r }\n",
      ),
    ).toThrow(/inside its own range/);
  });

  it('rejects a range it cannot read', () => {
    expect(() =>
      parseCompatibility(
        "schemaVersion: 1\nnode: '22'\ntools:\n  x: { range: '^1.0.0', tested: '1.0.0', role: r }\n",
      ),
    ).toThrow(/comparators/);
  });

  it('has a snapshot fixture for the tested playwright-cli, in a format the parser reads', () => {
    const cli = compatibility.tools['@playwright/cli'];
    const fixtures = readdirSync(join(import.meta.dirname, 'snapshots'));
    expect(fixtures).toContain(`playwright-cli@${cli?.tested ?? ''}`);
    expect(cli?.snapshotFormats).toContain(MARKDOWN_YAML_V1);
  });
});

describe('judging versions', () => {
  it('says which are inside and which are not', () => {
    const findings = judgeVersions(compatibility, {
      '@playwright/cli': '0.1.22',
      '@playwright/test': '1.40.0',
      'not-listed': '9.9.9',
    });
    expect(findings.map((f) => [f.tool, f.verdict])).toEqual([
      ['@playwright/cli', 'inside'],
      ['@playwright/test', 'outside'],
    ]);
  });

  it('does not judge a version that is not a plain one', () => {
    const [finding] = judgeVersions(compatibility, { '@playwright/cli': '0.2.0-beta.1' });
    expect(finding?.verdict).toBe('not-judged');
  });

  it('describes what moved and what to do, and nothing about what did not', () => {
    const lines = describeUpstreamDrift(
      judgeVersions(compatibility, { '@playwright/cli': '0.1.22', '@playwright/mcp': '0.1.0' }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('@playwright/mcp 0.1.0 is outside the tested range');
    expect(lines[0]).toContain('compatibility.yaml');
  });
});

describe.skipIf(!existsSync(join(REPO, 'packages', 'engine', 'dist', 'index.js')))(
  'scripts/check-upstream.mjs',
  () => {
    const run = (versions: Record<string, string>) =>
      spawnSync(process.execPath, [join(REPO, 'scripts', 'check-upstream.mjs')], {
        encoding: 'utf8',
        env: { ...process.env, UNDERSTUDY_UPSTREAM_VERSIONS: JSON.stringify(versions) },
      });

    const current = Object.fromEntries(
      Object.entries(compatibility.tools).map(([name, tool]) => [name, tool.tested]),
    );

    it('passes when every newest release is inside its range', () => {
      const result = run(current);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('inside the range');
    });

    it('fails, saying which tool and what to do, when one has moved on', () => {
      const result = run({ ...current, '@playwright/cli': '0.2.0' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('@playwright/cli 0.2.0 is outside the tested range');
      expect(result.stderr).not.toContain('@playwright/test');
    });
  },
);
