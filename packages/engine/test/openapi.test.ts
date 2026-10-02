import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openApiAdapter } from '../src/agent-kb/extract/adapters.js';
import { readOpenApi } from '../src/agent-kb/extract/openapi.js';
import { scanSource, type SourceFileRef } from '../src/agent-kb/extract/scan.js';
import { extract } from '../src/agent-kb/extract/run.js';

/**
 * OpenAPI is read with a parser, so the properties worth testing are the ones a
 * line-based reader cannot have: the same contract gives the same endpoints in
 * every spelling, and a document that is wrong says so instead of vanishing.
 */

const DEMO = join(import.meta.dirname, '..', '..', '..', 'examples', 'demo-app');
const demoText = (name: string) => readFileSync(join(DEMO, name), 'utf8');

const file = (path: string, text: string): SourceFileRef => ({
  path,
  lines: text.split('\n'),
  hash: 'test',
});

const pairs = (text: string, path = 'openapi.json') =>
  readOpenApi(file(path, text)).surface.map((entry) => `${entry.method ?? ''} ${entry.path}`);

const DEMO_ENDPOINTS = [
  'DELETE /api/items/{id}',
  'GET /api/items',
  'GET /api/me',
  'POST /api/items',
  'POST /api/login',
  'POST /api/password',
];

describe('the same contract in every spelling', () => {
  it('reads the demo app as pretty JSON', () => {
    expect([...pairs(demoText('openapi.json'))].sort()).toEqual(DEMO_ENDPOINTS);
  });

  it('reads the demo app as YAML', () => {
    expect([...pairs(demoText('openapi.yaml'), 'openapi.yaml')].sort()).toEqual(DEMO_ENDPOINTS);
  });

  it('reads the demo app as minified JSON', () => {
    const minified = JSON.stringify(JSON.parse(demoText('openapi.json')));
    expect(minified.split('\n')).toHaveLength(1);
    expect([...pairs(minified)].sort()).toEqual(DEMO_ENDPOINTS);
  });

  it('gives identical endpoints for JSON, YAML and minified JSON', () => {
    const json = pairs(demoText('openapi.json'));
    expect(pairs(demoText('openapi.yaml'), 'openapi.yaml')).toEqual(json);
    expect(pairs(JSON.stringify(JSON.parse(demoText('openapi.json'))))).toEqual(json);
  });

  it('copes with tab indentation and CRLF line endings', () => {
    const doc = JSON.parse(demoText('openapi.json')) as unknown;
    expect(pairs(JSON.stringify(doc, null, '\t'))).toEqual(pairs(demoText('openapi.json')));
    expect(pairs(JSON.stringify(doc, null, 2).replaceAll('\n', '\r\n'))).toEqual(
      pairs(demoText('openapi.json')),
    );
  });
});

describe('source lines', () => {
  it('points at the line of each method', () => {
    const text = demoText('openapi.json');
    const lines = text.split('\n');
    for (const entry of readOpenApi(file('openapi.json', text)).surface) {
      const number = Number(entry.source.split(':').pop());
      expect(lines[number - 1]).toContain(`"${(entry.method ?? '').toLowerCase()}"`);
    }
  });

  it('points at the right line in YAML too', () => {
    const text = demoText('openapi.yaml');
    const lines = text.split('\n');
    for (const entry of readOpenApi(file('openapi.yaml', text)).surface) {
      const number = Number(entry.source.split(':').pop());
      expect(lines[number - 1]?.trim()).toBe(`${(entry.method ?? '').toLowerCase()}:`);
    }
  });
});

describe('what it reads', () => {
  it('prefixes a Swagger 2.0 basePath', () => {
    const doc = { swagger: '2.0', basePath: '/v1/', paths: { '/users': { get: {} } } };
    expect(pairs(JSON.stringify(doc))).toEqual(['GET /v1/users']);
  });

  it('ignores a basePath of "/" and OpenAPI 3 servers', () => {
    expect(
      pairs(JSON.stringify({ swagger: '2.0', basePath: '/', paths: { '/a': { get: {} } } })),
    ).toEqual(['GET /a']);
    const v3 = {
      openapi: '3.1.0',
      servers: [{ url: 'https://x.test/v2' }],
      paths: { '/a': { get: {} } },
    };
    expect(pairs(JSON.stringify(v3))).toEqual(['GET /a']);
  });

  it('skips path-item keys that are not operations, and x- extensions', () => {
    const doc = {
      openapi: '3.0.0',
      paths: {
        '/a': { summary: 'x', parameters: [], servers: [], get: {}, trace: {} },
        'x-internal': { get: {} },
      },
    };
    expect(pairs(JSON.stringify(doc))).toEqual(['GET /a', 'TRACE /a']);
  });

  it('follows a local $ref to a path item', () => {
    const doc = {
      openapi: '3.1.0',
      paths: { '/shared': { $ref: '#/components/pathItems/Shared' } },
      components: { pathItems: { Shared: { get: {}, delete: {} } } },
    };
    expect(pairs(JSON.stringify(doc))).toEqual(['DELETE /shared', 'GET /shared']);
  });

  it('reads a document with no version field, and says so', () => {
    const result = readOpenApi(
      file('openapi.yaml', 'paths:\n  /users:\n    get:\n      summary: x\n'),
    );
    expect(result.surface.map((e) => e.path)).toEqual(['/users']);
    expect(result.gaps.join(' ')).toContain('no openapi or swagger version');
  });
});

describe('what it cannot read', () => {
  it('reports invalid JSON and reads nothing from it', () => {
    const result = readOpenApi(file('openapi.json', '{ "paths": { "/a": { "get": '));
    expect(result.surface).toEqual([]);
    expect(result.gaps[0]).toMatch(/openapi\.json: not valid JSON or YAML/);
  });

  it.each([
    ['a list at the top level', '- a\n- b\n', /not an OpenAPI document/],
    ['no paths', '{"openapi":"3.0.0","info":{}}', /no "paths" mapping/],
    ['Swagger 1.2', '{"swagger":"1.2","paths":{"/a":{"get":{}}}}', /version 1\.2 is not supported/],
    [
      'OpenAPI 4',
      '{"openapi":"4.0.0","paths":{"/a":{"get":{}}}}',
      /version 4\.0\.0 is not supported/,
    ],
  ])('reports %s', (_name, text, gap) => {
    const result = readOpenApi(file('openapi.json', text));
    expect(result.surface).toEqual([]);
    expect(result.gaps.join(' ')).toMatch(gap);
  });

  it('keeps reading the other paths when one $ref is outside the file', () => {
    const doc = {
      openapi: '3.0.0',
      paths: {
        '/ok': { get: {} },
        '/far': { $ref: './other.yaml#/x' },
        '/lost': { $ref: '#/nope' },
      },
    };
    const result = readOpenApi(file('openapi.json', JSON.stringify(doc)));
    expect(result.surface.map((e) => e.path)).toEqual(['/ok']);
    expect(result.gaps.join(' ')).toContain('./other.yaml#/x, which is outside this file');
    expect(result.gaps.join(' ')).toContain('#/nope, which does not resolve');
  });
});

describe('through the adapter and a whole extract', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function product(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'cue-openapi-'));
    roots.push(root);
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(root, name, '..'), { recursive: true });
      writeFileSync(join(root, name), text, 'utf8');
    }
    return root;
  }

  it('finds the endpoints of a JSON file the old line reader missed', () => {
    const root = product({ 'api/openapi.json': demoText('openapi.json') });
    const surface = openApiAdapter.extract({ files: scanSource(root).files }).surface ?? [];
    expect(surface.map((e) => `${e.method ?? ''} ${e.path}`).sort()).toEqual(DEMO_ENDPOINTS);
    expect(surface.every((e) => e.source.startsWith('api/openapi.json:'))).toBe(true);
  });

  it('surfaces a broken document as a gap in the extract result', () => {
    const suite = mkdtempSync(join(tmpdir(), 'cue-suite-'));
    roots.push(suite);
    const root = product({ 'openapi.json': '{ not json' });
    const result = extract({ projectRoot: suite, sourceRoot: root });
    expect(result.gaps.join(' ')).toContain('openapi.json: not valid JSON or YAML');
  });
});
