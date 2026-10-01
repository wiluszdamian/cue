import { isMap, isScalar, LineCounter, parseDocument, type Document, type Node } from 'yaml';
import { reference, type SourceFileRef } from './scan.js';
import type { SurfaceEntry } from './types.js';

/**
 * Reading an OpenAPI document with a parser rather than a pattern. JSON is YAML,
 * so one parser covers both and the same contract in either spelling yields the
 * same endpoints; it also covers minified JSON, which a line-based reader cannot
 * see into at all. The parser's source positions keep every endpoint traceable to
 * a `file:line`.
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

export interface OpenApiResult {
  readonly surface: SurfaceEntry[];
  readonly gaps: string[];
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `#/components/pathItems/Users` → the object it names, inside this document only. */
function resolvePointer(root: unknown, ref: string): unknown {
  let node: unknown = root;
  for (const raw of ref.slice(2).split('/')) {
    const part = decodeURIComponent(raw).replaceAll('~1', '/').replaceAll('~0', '~');
    if (!isObject(node)) return undefined;
    node = node[part];
  }
  return node;
}

/** Swagger 2.0 declares a shared prefix; OpenAPI 3 uses server URLs, which are environment. */
function basePathOf(data: Json, isSwagger2: boolean): string {
  const base = isSwagger2 && typeof data['basePath'] === 'string' ? data['basePath'] : '';
  return base === '/' ? '' : base.replace(/\/+$/, '');
}

function firstLine(message: string): string {
  return message.split('\n')[0] ?? message;
}

export function readOpenApi(file: SourceFileRef): OpenApiResult {
  const surface: SurfaceEntry[] = [];
  const gaps: string[] = [];
  // Rejoined with the original separator, so offsets and line numbers match the file.
  const text = file.lines.join('\n');

  const lineCounter = new LineCounter();
  const doc: Document.Parsed = parseDocument(text, { lineCounter });

  const syntaxError = doc.errors[0];
  if (syntaxError !== undefined) {
    gaps.push(
      `${file.path}: not valid JSON or YAML, so no endpoints were read from it (${firstLine(syntaxError.message)})`,
    );
    return { surface, gaps };
  }

  const data: unknown = doc.toJS();
  if (!isObject(data)) {
    gaps.push(`${file.path}: not an OpenAPI document (the top level is not a mapping)`);
    return { surface, gaps };
  }

  const openapi = data['openapi'];
  const swagger = data['swagger'];
  const isSwagger2 = swagger === '2.0' || swagger === 2;
  if (openapi === undefined && swagger === undefined) {
    // Still read: a hand-trimmed document is common, and `paths` alone is unambiguous.
    gaps.push(`${file.path}: has no openapi or swagger version field; read as OpenAPI anyway`);
  } else if (!isSwagger2 && !(typeof openapi === 'string' && openapi.startsWith('3.'))) {
    const found = String(openapi ?? swagger);
    gaps.push(`${file.path}: version ${found} is not supported (OpenAPI 3.x and Swagger 2.0 are)`);
    return { surface, gaps };
  }

  const pathsNode = doc.get('paths', true);
  if (!isMap(pathsNode)) {
    gaps.push(`${file.path}: no "paths" mapping, so it declares no endpoints`);
    return { surface, gaps };
  }

  const prefix = basePathOf(data, isSwagger2);

  for (const pair of pathsNode.items) {
    const key = pair.key;
    if (!isScalar(key) || typeof key.value !== 'string') continue;
    const route = key.value;
    // Extensions such as `x-internal` sit beside real paths.
    if (!route.startsWith('/')) continue;

    const keyNode = key as Node;
    const offset = keyNode.range?.[0] ?? 0;
    const line = lineCounter.linePos(offset).line - 1;

    let operations: Iterable<{ method: string; line: number }> = [];
    const item = pair.value as Node | null;

    if (isMap(item)) {
      const ref = item.get('$ref');
      if (typeof ref === 'string') {
        if (!ref.startsWith('#/')) {
          gaps.push(`${file.path}: ${route} refers to ${ref}, which is outside this file`);
          continue;
        }
        const target = resolvePointer(data, ref);
        if (!isObject(target)) {
          gaps.push(`${file.path}: ${route} refers to ${ref}, which does not resolve`);
          continue;
        }
        // The referenced item is elsewhere; the declaring line is the honest source.
        operations = Object.keys(target).map((method) => ({ method, line }));
      } else {
        operations = item.items.flatMap((operation) => {
          const methodKey = operation.key;
          if (!isScalar(methodKey) || typeof methodKey.value !== 'string') return [];
          const at = (methodKey as Node).range?.[0] ?? offset;
          return [{ method: methodKey.value, line: lineCounter.linePos(at).line - 1 }];
        });
      }
    }

    for (const operation of operations) {
      if (!METHODS.includes(operation.method.toLowerCase())) continue;
      surface.push({
        kind: 'endpoint',
        path: `${prefix}${route}`,
        method: operation.method.toUpperCase(),
        source: reference(file, operation.line),
      });
    }
  }

  surface.sort(
    (a, b) => a.path.localeCompare(b.path) || (a.method ?? '').localeCompare(b.method ?? ''),
  );
  return { surface, gaps };
}
