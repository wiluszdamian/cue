import { createHash } from 'node:crypto';

export function hashSnapshot(tree: string): string {
  return createHash('sha256').update(tree.replace(/\r\n/g, '\n').trim(), 'utf8').digest('hex');
}

/** `getByRole` first, and never CSS — a stored selector is copied out as fact later. */
export function locatorFor(role: string, name: string | undefined, level?: number): string {
  const options: string[] = [];
  if (name !== undefined && name.length > 0) options.push(`name: ${quote(name)}`);
  if (level !== undefined) options.push(`level: ${String(level)}`);

  return options.length > 0
    ? `getByRole(${quote(role)}, { ${options.join(', ')} })`
    : `getByRole(${quote(role)})`;
}

/** Single quotes: these are pasted into test files, and must not reformat on save. */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Path only: the host belongs to the environment, never to the map. */
export function routeFromUrl(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url.startsWith('/') ? url : `/${url}`;
  }
}

/** `/checkout/payment` -> `checkout-payment`, for a filename. */
export function routeToFilename(route: string): string {
  const slug = route
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug.length > 0 ? slug : 'index';
}
