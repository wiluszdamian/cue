import { describe, expect, it } from 'vitest';
import { i18nAdapter } from '../src/agent-kb/extract/adapters.js';
import { readCatalogue } from '../src/agent-kb/extract/i18n.js';
import type { SourceFileRef } from '../src/agent-kb/extract/scan.js';

/**
 * A translation catalogue is read by a parser. What is pinned here is the full dotted key,
 * the line of the value, and that JSON and YAML saying the same thing give the same answer.
 */

function file(path: string, text: string): SourceFileRef {
  return { path, lines: text.split('\n'), hash: 'h' };
}

const keysOf = (result: ReturnType<typeof readCatalogue>) =>
  result.terms.map((term) => [term.key, term.label, term.source]);

describe('a flat catalogue', () => {
  it('keeps a key that already has dots in it', () => {
    const result = readCatalogue(
      file('locales/en.json', '{\n  "login.submit": "Log in",\n  "login.title": "Sign in"\n}\n'),
    );
    expect(keysOf(result)).toEqual([
      ['login.submit', 'Log in', 'locales/en.json:2'],
      ['login.title', 'Sign in', 'locales/en.json:3'],
    ]);
    expect(result.gaps).toEqual([]);
  });
});

describe('a nested catalogue', () => {
  const nested = file(
    'locales/en.json',
    [
      '{',
      '  "auth": {',
      '    "login": {',
      '      "title": "Sign in",',
      '      "submit": "Log in"',
      '    },',
      '    "logout": "Log out"',
      '  },',
      '  "common": { "ok": "OK" }',
      '}',
    ].join('\n'),
  );

  it('gives the whole path, not the last segment', () => {
    expect(keysOf(readCatalogue(nested))).toEqual([
      ['auth.login.title', 'Sign in', 'locales/en.json:4'],
      ['auth.login.submit', 'Log in', 'locales/en.json:5'],
      ['auth.logout', 'Log out', 'locales/en.json:7'],
      ['common.ok', 'OK', 'locales/en.json:9'],
    ]);
  });
});

describe('a minified catalogue', () => {
  it('is read, with every value on line 1', () => {
    const result = readCatalogue(
      file('i18n/en.json', '{"auth":{"login":{"submit":"Log in"}},"common":{"ok":"OK"}}'),
    );
    expect(keysOf(result)).toEqual([
      ['auth.login.submit', 'Log in', 'i18n/en.json:1'],
      ['common.ok', 'OK', 'i18n/en.json:1'],
    ]);
  });
});

describe('YAML', () => {
  it('reads nested keys with the line of each value', () => {
    const result = readCatalogue(
      file(
        'locales/en.yaml',
        'auth:\n  login:\n    submit: Log in\n    title: "Sign in"\nok: OK\n',
      ),
    );
    expect(keysOf(result)).toEqual([
      ['auth.login.submit', 'Log in', 'locales/en.yaml:3'],
      ['auth.login.title', 'Sign in', 'locales/en.yaml:4'],
      ['ok', 'OK', 'locales/en.yaml:5'],
    ]);
  });

  it('gives the same keys and labels as the JSON that says the same thing', () => {
    const json = readCatalogue(
      file('l/en.json', '{\n  "a": {\n    "b": "One",\n    "c": "Two"\n  }\n}\n'),
    );
    const yaml = readCatalogue(file('l/en.yml', 'a:\n  b: One\n  c: Two\n'));
    const strip = (r: ReturnType<typeof readCatalogue>) => r.terms.map((t) => [t.key, t.label]);
    expect(strip(yaml)).toEqual(strip(json));
  });
});

describe('what is and is not a label', () => {
  const read = (text: string) => readCatalogue(file('locales/en.json', text));

  it('skips numbers, booleans, null and empty strings', () => {
    expect(
      keysOf(read('{"a": 1, "b": true, "c": null, "d": "", "e": "yes"}')).map((row) => row[0]),
    ).toEqual(['e']);
  });

  it('keeps placeholders exactly as written', () => {
    const labels = read(
      '{"hello": "Hello, {{name}}!", "items": "{count, plural, one {# item} other {# items}}", "pct": "%s done"}',
    ).terms.map((t) => t.label);
    expect(labels).toEqual([
      'Hello, {{name}}!',
      '{count, plural, one {# item} other {# items}}',
      '%s done',
    ]);
  });

  it('numbers the items of a list in the key', () => {
    expect(
      keysOf(read('{"steps": ["First", "Second"], "tips": {"list": ["A"]}}')).map((r) =>
        r.slice(0, 2),
      ),
    ).toEqual([
      ['steps.0', 'First'],
      ['steps.1', 'Second'],
      ['tips.list.0', 'A'],
    ]);
  });

  it('reads a file indented with tabs and one that starts with a byte order mark', () => {
    expect(keysOf(read('{\n\t"a": {\n\t\t"b": "x"\n\t}\n}')).map((r) => r[0])).toEqual(['a.b']);
    expect(keysOf(read('\ufeff{"a": "x"}')).map((r) => r[0])).toEqual(['a']);
  });

  it('decodes escapes, so the label is what the user sees', () => {
    expect(read('{"q": "say \\"hi\\" \\u00e9"}').terms[0]?.label).toBe('say "hi" é');
  });

  it('does not follow a YAML alias, which would count one label as two', () => {
    const result = readCatalogue(file('l/en.yaml', 'a: &x Hello\nb: *x\n'));
    expect(result.terms.map((t) => t.key)).toEqual(['a']);
  });
});

describe('a file that cannot be read', () => {
  it('is a gap that names the file, and yields nothing', () => {
    const result = readCatalogue(file('locales/en.json', '{"a": "x",,'));
    expect(result.terms).toEqual([]);
    expect(result.gaps[0]).toContain('locales/en.json: not valid JSON or YAML');
  });

  it('does not read a list at the top level as a catalogue', () => {
    const result = readCatalogue(file('locales/en.json', '["a", "b"]'));
    expect(result.terms).toEqual([]);
    expect(result.gaps[0]).toContain('top level is not a mapping');
  });

  it('reads a repeated key and says so', () => {
    const result = readCatalogue(file('locales/en.json', '{"a": "one", "a": "two"}'));
    expect(result.terms).toHaveLength(1);
    expect(result.gaps[0]).toContain('appears more than once');
  });

  it('stops descending at a depth no catalogue reaches', () => {
    const deep = `${'{"a":'.repeat(40)}"x"${'}'.repeat(40)}`;
    const result = readCatalogue(file('locales/en.json', deep));
    expect(result.terms).toEqual([]);
    expect(result.gaps.join(' ')).toContain('levels deep');
  });

  it('does not stop the other catalogues from being read', () => {
    const result = i18nAdapter.extract({
      files: [file('locales/broken.json', '{"a": '), file('locales/en.json', '{"ok": "OK"}')],
    });
    expect(result.terms?.map((t) => t.key)).toEqual(['ok']);
    expect(result.gaps?.[0]).toContain('locales/broken.json');
  });
});

describe('several locales', () => {
  const files = [
    file('locales/de.json', '{"auth": {"submit": "Anmelden"}}'),
    file('locales/en.json', '{"auth": {"submit": "Log in"}}'),
  ];

  it('keeps the English label, whatever order the disk listed them in', () => {
    for (const ordered of [files, [...files].reverse()]) {
      const result = i18nAdapter.extract({ files: ordered });
      expect(result.terms).toEqual([
        { key: 'auth.submit', label: 'Log in', source: 'locales/en.json:1' },
      ]);
    }
  });

  it('says that the other language was left out, rather than dropping it silently', () => {
    const result = i18nAdapter.extract({ files });
    expect(result.gaps?.[0]).toContain('locales/de.json');
    expect(result.gaps?.[0]).toContain('locales are not recorded');
  });

  it('says nothing when two catalogues agree', () => {
    const result = i18nAdapter.extract({
      files: [
        file('locales/en/a.json', '{"ok": "OK"}'),
        file('locales/en-US/a.json', '{"ok": "OK"}'),
      ],
    });
    expect(result.gaps).toBeUndefined();
  });
});
