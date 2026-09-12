import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { ConstitutionSchema, type Constitution } from './schema/constitution.js';
import { OwnershipSchema, type Ownership } from './schema/ownership.js';
import { TagSetSchema, type TagSet } from './schema/tags.js';

export class RulesLoadError extends Error {
  constructor(
    override readonly message: string,
    readonly file: string,
  ) {
    super(message);
    this.name = 'RulesLoadError';
  }
}

/**
 * YAML parse errors carry offsets; Zod issues carry paths. Both are useless to
 * whoever edits the constitution unless they come back as "file, line, what to
 * change", so both are normalised into that shape here.
 */
function parseYaml(file: string, text: string): unknown {
  const doc = parseDocument(text, { prettyErrors: true });
  if (doc.errors.length > 0) {
    const details = doc.errors
      .map((e) => {
        const pos = e.linePos?.[0];
        const at = pos ? `${pos.line}:${pos.col}` : `offset ${e.pos[0]}`;
        return `  ${at}  ${e.message}`;
      })
      .join('\n');
    throw new RulesLoadError(`${file} is not valid YAML:\n${details}`, file);
  }
  return doc.toJS();
}

function formatIssues(file: string, error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `  ${path}\n      ${issue.message}`;
  });
  return `${file} does not match its schema:\n${lines.join('\n')}`;
}

function loadYamlFile<T>(file: string, schema: z.ZodType<T>): T {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new RulesLoadError(
      `cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      file,
    );
  }

  const parsed = schema.safeParse(parseYaml(file, text));
  if (!parsed.success) {
    throw new RulesLoadError(formatIssues(file, parsed.error), file);
  }
  return parsed.data;
}

export function loadConstitution(path: string): Constitution {
  return loadYamlFile(resolve(path), ConstitutionSchema);
}

export function loadTags(path: string): TagSet {
  return loadYamlFile(resolve(path), TagSetSchema);
}

export function loadOwnership(path: string): Ownership {
  return loadYamlFile(resolve(path), OwnershipSchema);
}

export interface Rules {
  readonly constitution: Constitution;
  readonly tags: TagSet;
  readonly ownership: Ownership;
  readonly dir: string;
}

/**
 * Loads a whole `rules/` directory. Everything downstream — the plugin, the
 * docs generator, the MCP server — takes this one object, so there is a single
 * place where "the rules" are defined to have been read successfully.
 */
export function loadRules(dir: string): Rules {
  const root = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  return {
    constitution: loadConstitution(join(root, 'constitution.yaml')),
    tags: loadTags(join(root, 'tags.yaml')),
    ownership: loadOwnership(join(root, 'ownership.yaml')),
    dir: root,
  };
}
