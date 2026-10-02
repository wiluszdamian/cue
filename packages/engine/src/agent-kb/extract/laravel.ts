import type { SurfaceEntry } from './types.js';
import { reference, type SourceFileRef } from './scan.js';

/**
 * Laravel routes, read from `routes/*.php` and nothing else. The route files
 * name the verb, the path and the controller; the controller file gives the line
 * the action is defined on, so a claim points at the code that answers it rather
 * than at the line that registers it.
 *
 * A line-based reader, like the other adapters: it follows `prefix()` groups and
 * `resource()` expansion, and says so in a gap when it meets something it cannot
 * follow (`Route::macro`, routes registered in a service provider).
 */

export const LARAVEL_ROUTES = /(?:^|\/)routes\/(?:.+\/)?[^/]+\.php$/;
const COMPOSER_LARAVEL = /"laravel\/framework"\s*:/;
/** Not HTTP surface. */
const NON_HTTP = /(?:^|\/)routes\/(?:console|channels)\.php$/;

const VERBS = 'get|post|put|patch|delete|options|any|match|view|resource|apiResource';
const ROUTE_CALL = new RegExp(
  String.raw`Route::(?:[a-zA-Z]+\([^)]*\)->)*(${VERBS})\(\s*(?:(\[[^\]]*\])\s*,\s*)?(?:['"]([^'"]*)['"])`,
);
const PREFIX = /(?:Route::|->)prefix\(\s*['"]([^'"]*)['"]\s*\)/;
const GROUP_ARRAY_PREFIX = /Route::group\(\s*\[[^\]]*['"]prefix['"]\s*=>\s*['"]([^'"]*)['"]/;

const RESOURCE_ACTIONS: readonly { action: string; method: string; suffix: string }[] = [
  { action: 'index', method: 'GET', suffix: '' },
  { action: 'create', method: 'GET', suffix: '/create' },
  { action: 'store', method: 'POST', suffix: '' },
  { action: 'show', method: 'GET', suffix: '/{id}' },
  { action: 'edit', method: 'GET', suffix: '/{id}/edit' },
  { action: 'update', method: 'PUT', suffix: '/{id}' },
  { action: 'destroy', method: 'DELETE', suffix: '/{id}' },
];
const API_RESOURCE_SKIPS = new Set(['create', 'edit']);

export function isLaravelRoutesFile(file: SourceFileRef): boolean {
  return LARAVEL_ROUTES.test(file.path) && !NON_HTTP.test(file.path);
}

export function looksLikeLaravel(files: readonly SourceFileRef[]): boolean {
  return files.some(
    (file) =>
      isLaravelRoutesFile(file) ||
      ((file.path === 'composer.json' || file.path.endsWith('/composer.json')) &&
        COMPOSER_LARAVEL.test(file.lines.join('\n'))),
  );
}

interface Controller {
  readonly file: SourceFileRef;
}

function findController(
  files: readonly SourceFileRef[],
  className: string,
): Controller | undefined {
  const short = className.split('\\').pop() ?? className;
  const matches = files.filter(
    (f) => f.path === `${short}.php` || f.path.endsWith(`/${short}.php`),
  );
  const file = matches.find((f) => f.path.includes('Http/Controllers')) ?? matches[0];
  return file === undefined ? undefined : { file };
}

/** The `file:line` of `function index(` in the controller, when it is there. */
function actionReference(controller: Controller | undefined, action: string): string | undefined {
  if (controller === undefined) return undefined;
  const pattern = new RegExp(String.raw`function\s+${action}\s*\(`);
  const index = controller.file.lines.findIndex((line) => pattern.test(line));
  return index === -1 ? undefined : reference(controller.file, index);
}

interface Handler {
  readonly controller: string;
  readonly action: string | undefined;
}

/** `[UserController::class, 'index']`, `'UserController@index'`, or an invokable `UserController::class`. */
function handlerOf(text: string): Handler | undefined {
  const pair = /\[\s*([\w\\]+)::class\s*,\s*['"](\w+)['"]\s*\]/.exec(text);
  if (pair?.[1] !== undefined) return { controller: pair[1], action: pair[2] };
  const at = /['"]([\w\\]+)@(\w+)['"]/.exec(text);
  if (at?.[1] !== undefined) return { controller: at[1], action: at[2] };
  const invokable = /([\w\\]+)::class/.exec(text);
  return invokable?.[1] === undefined
    ? undefined
    : { controller: invokable[1], action: '__invoke' };
}

function joinPath(...parts: readonly string[]): string {
  const path = parts
    .join('/')
    .split('/')
    .filter((part) => part.length > 0)
    .join('/');
  return `/${path}`;
}

function singular(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

const braceDelta = (line: string): number =>
  (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);

export interface LaravelResult {
  readonly surface: SurfaceEntry[];
  readonly gaps: string[];
}

export function readLaravelRoutes(
  routesFile: SourceFileRef,
  all: readonly SourceFileRef[],
): LaravelResult {
  const surface: SurfaceEntry[] = [];
  const gaps: string[] = [];
  const isApi = /(?:^|\/)routes\/api\.php$/.test(routesFile.path);
  const base = isApi ? 'api' : '';

  // Open `prefix()` groups, each with the brace depth it was opened at.
  const stack: { prefix: string; depth: number }[] = [];
  let depth = 0;
  let pendingPrefix: string | undefined;

  const currentPrefix = (): string => joinPath(base, ...stack.map((entry) => entry.prefix));

  routesFile.lines.forEach((line, index) => {
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*#.*$/, '');

    const prefix = PREFIX.exec(code)?.[1] ?? GROUP_ARRAY_PREFIX.exec(code)?.[1];
    if (prefix !== undefined) pendingPrefix = prefix;

    const opensGroup = /\bgroup\(/.test(code) && code.includes('{');
    if (opensGroup) {
      stack.push({ prefix: pendingPrefix ?? '', depth });
      pendingPrefix = undefined;
    }

    const call = ROUTE_CALL.exec(code);
    if (call?.[1] !== undefined && !opensGroup) {
      const verb = call[1];
      const uri = call[3] ?? '';
      // A handler may sit on the following lines of a multi-line call.
      const window = [code, ...routesFile.lines.slice(index + 1, index + 4)].join(' ');
      const handler = handlerOf(window.split(';')[0] ?? window);
      const controller =
        handler === undefined ? undefined : findController(all, handler.controller);
      const here = reference(routesFile, index);
      // `Route::prefix('x')->get(...)` carries its prefix on the route itself, not on a group.
      const inline = prefix ?? '';
      pendingPrefix = undefined;
      const prefixed = (suffix: string) => joinPath(currentPrefix(), inline, uri, suffix);

      if (verb === 'resource' || verb === 'apiResource') {
        const name = uri.split('/').pop() ?? uri;
        const param = singular(name);
        for (const entry of RESOURCE_ACTIONS) {
          if (verb === 'apiResource' && API_RESOURCE_SKIPS.has(entry.action)) continue;
          const source = actionReference(controller, entry.action);
          // Declared by the resource, but only real when the controller defines it.
          if (controller !== undefined && source === undefined) continue;
          surface.push({
            kind: 'endpoint',
            path: prefixed(entry.suffix.replace('{id}', `{${param}}`)),
            method: entry.method,
            source: source ?? here,
          });
        }
      } else {
        const source =
          (handler?.action === undefined
            ? undefined
            : actionReference(controller, handler.action)) ?? here;
        const methods =
          verb === 'match'
            ? [...(call[2] ?? '').matchAll(/['"](\w+)['"]/g)].map((m) => (m[1] ?? '').toUpperCase())
            : verb === 'any'
              ? [undefined]
              : verb === 'view'
                ? ['GET']
                : [verb.toUpperCase()];
        for (const method of methods) {
          const page = !isApi && (method === 'GET' || verb === 'view');
          surface.push({
            kind: page ? 'route' : 'endpoint',
            path: prefixed(''),
            ...(method === undefined || page ? {} : { method }),
            source,
          });
        }
      }
    }

    depth += braceDelta(code);
    while (stack.length > 0 && depth <= (stack[stack.length - 1]?.depth ?? 0)) stack.pop();
  });

  if (surface.length === 0) {
    gaps.push(
      `${routesFile.path}: no Route:: declarations were recognised; routes registered another way (a provider, a macro) are not read`,
    );
  }
  return { surface, gaps };
}
