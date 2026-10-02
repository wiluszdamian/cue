import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runChecks, summarise, type CheckResult } from '../src/doctor.js';
import { COMPATIBILITY } from '../src/generated/compatibility.js';
import { planInit } from '../src/init.js';
import { getTarget, TARGETS } from '../src/targets/index.js';

/**
 * The versions of other people's tools are the project's main risk, so what is
 * written into somebody's repository names them, and `doctor` says when they have
 * drifted.
 */

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cue-compat-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const detection = { manager: 'pnpm', evidence: 'test', confident: true } as const;
const RELEASE = '4.5.6';

describe('the MCP configuration init writes', () => {
  const written = (manager: 'npm' | 'pnpm' | 'yarn' | 'bun') =>
    [...TARGETS.keys()].flatMap((id) =>
      getTarget(id)
        .files({
          projectRoot: root,
          packageManager: manager,
          rules: planInit({
            projectRoot: root,
            detection,
            cueVersion: RELEASE,
            env: {},
            home: root,
          }).rules,
          cueVersion: RELEASE,
        })
        .map((file) => file.content),
    );

  it.each(['npm', 'pnpm', 'yarn', 'bun'] as const)('never says @latest (%s)', (manager) => {
    const everything = written(manager).join('\n');
    expect(everything).toContain('@wiluszdamian/cue-mcp');
    expect(everything).not.toContain('@latest');
  });

  it('pins our server to the release that wrote the file', () => {
    expect(written('npm').join('\n')).toContain(`@wiluszdamian/cue-mcp@${RELEASE}`);
  });

  it('pins the browser server to the version that was tested', () => {
    const tested = COMPATIBILITY.tools['@playwright/mcp']?.tested ?? '';
    expect(tested).not.toBe('');
    expect(written('npm').join('\n')).toContain(`@playwright/mcp@${tested}`);
  });
});

describe('doctor and the versions installed here', () => {
  const install = (name: string, version: string): void => {
    const dir = join(root, 'node_modules', ...name.split('/'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }));
  };

  const versionChecks = (): CheckResult[] =>
    summarise(
      runChecks({
        projectRoot: root,
        manifest: undefined,
        rules: undefined,
        detection,
        cueVersion: RELEASE,
        env: {},
        home: root,
      }),
    ).results.filter((r) => r.id.startsWith('tool-version'));

  it('says nothing about a tool that is not installed', () => {
    expect(versionChecks()).toEqual([]);
  });

  it('is one line when what is installed is inside the tested ranges', () => {
    install('@playwright/cli', COMPATIBILITY.tools['@playwright/cli']?.tested ?? '');
    install('@playwright/test', COMPATIBILITY.tools['@playwright/test']?.tested ?? '');
    const [only, ...rest] = versionChecks();
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ id: 'tool-versions', status: 'ok' });
  });

  it('warns about one outside its range, with the command that installs the tested one', () => {
    install('@playwright/cli', '0.3.0');
    const [found] = versionChecks();
    expect(found?.status).toBe('warn');
    expect(found?.detail).toContain('0.3.0 is outside');
    expect(found?.fix).toBe(
      `pnpm add -D @playwright/cli@${COMPATIBILITY.tools['@playwright/cli']?.tested ?? ''}`,
    );
  });

  it('does not judge a pre-release, and does not pass it either', () => {
    install('@playwright/test', '1.70.0-beta.1');
    const [found] = versionChecks();
    expect(found?.status).toBe('unchecked');
  });
});
