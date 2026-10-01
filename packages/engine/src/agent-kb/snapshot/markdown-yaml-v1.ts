import type { KbElement, KbLink } from '../../schema/agent-kb.js';
import { locatorFor } from './shared.js';
import type { NormalizedBrowserObservation, RawSnapshot, SnapshotFormat } from './types.js';

/**
 * `playwright-cli snapshot` as printed by @playwright/cli 0.1.x:
 *
 *     ### Page
 *     - Page URL: http://localhost:8931/login
 *     - Page Title: Sign in
 *     ### Snapshot
 *     ```yaml
 *     - main [ref=e2]:
 *       - heading "Welcome back" [level=1] [ref=e3]
 *       - textbox "Email" [ref=e5]
 *       - link "Forgot password?" [ref=e9] [cursor=pointer]:
 *         - /url: /forgot
 *     ```
 *
 * Microsoft's format, not a stable API. Anything this parser does not recognise is
 * handed back as a warning rather than guessed at or dropped.
 */

export const MARKDOWN_YAML_V1 = 'playwright-cli/markdown-yaml@1';

const PAGE_HEADER = /^### Page\s*$/m;
const URL_LINE = /^-\s*Page URL:\s*(.+)$/m;
const TITLE_LINE = /^-\s*Page Title:\s*(.+)$/m;
const YAML_BLOCK = /```yaml\r?\n([\s\S]*?)```/;

/** `- role "name" [level=1] [ref=e3]:` — name and attributes are both optional. */
const NODE = /^(\s*)-\s+([a-zA-Z][a-zA-Z0-9-]*)(?:\s+"((?:[^"\\]|\\.)*)")?(.*)$/;
const ATTR = /\[([a-zA-Z]+)=([^\]]*)\]/g;
const URL_CHILD = /^\s*-\s*\/url:\s*(.+)$/;

/** Layout roles. Keeping them out stops the map becoming a DOM dump nobody reads. */
const STRUCTURAL_ROLES = new Set([
  'generic',
  'text',
  'paragraph',
  'list',
  'listitem',
  'group',
  'separator',
  'none',
  'presentation',
  'main',
  'article',
  'section',
]);

/** Enough to show the pattern without turning a broken page into a wall of text. */
const MAX_WARNINGS = 5;

function parseAttributes(rest: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of rest.matchAll(ATTR)) {
    const [, key, value] = match;
    if (key !== undefined && value !== undefined) attributes[key] = value;
  }
  return attributes;
}

function parse(raw: RawSnapshot): NormalizedBrowserObservation {
  const output = raw.text;
  const url = URL_LINE.exec(output)?.[1]?.trim();
  const title = TITLE_LINE.exec(output)?.[1]?.trim() ?? '';
  const tree = YAML_BLOCK.exec(output)?.[1] ?? '';

  const elements: KbElement[] = [];
  const links: KbLink[] = [];
  const unrecognised: string[] = [];
  const seen = new Set<string>();
  let lastLinkName: string | undefined;

  for (const line of tree.split('\n')) {
    if (line.trim().length === 0) continue;

    // A `/url:` child belongs to the link above it.
    const href = URL_CHILD.exec(line)?.[1]?.trim();
    if (href !== undefined) {
      links.push(lastLinkName === undefined ? { href } : { name: lastLinkName, href });
      continue;
    }

    const node = NODE.exec(line);
    if (!node) {
      unrecognised.push(line.trim());
      continue;
    }

    const [, , role = '', rawName, rest = ''] = node;
    const name = rawName?.replace(/\\"/g, '"');
    const attributes = parseAttributes(rest);
    const levelText = attributes['level'];
    const level = levelText === undefined ? undefined : Number.parseInt(levelText, 10);

    lastLinkName = role === 'link' ? name : undefined;

    // A locator that matches forty elements is not a locator.
    if (STRUCTURAL_ROLES.has(role)) continue;
    if (name === undefined || name.length === 0) continue;

    const key = `${role} ${name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    elements.push({
      role,
      name,
      ...(level !== undefined && Number.isFinite(level) ? { level } : {}),
      locator: locatorFor(role, name, Number.isFinite(level) ? level : undefined),
      // A survey alone has only seen the thing run; correlation upgrades this later.
      confidence: 'runtime-only',
    });
  }

  const warnings = unrecognised.slice(0, MAX_WARNINGS).map((line) => `Unrecognised line: ${line}`);
  if (unrecognised.length > MAX_WARNINGS) {
    warnings.push(`…and ${String(unrecognised.length - MAX_WARNINGS)} more unrecognised line(s).`);
  }

  return {
    ...(url !== undefined ? { url } : {}),
    title,
    tree: tree.trim(),
    elements,
    links,
    format: MARKDOWN_YAML_V1,
    warnings,
  };
}

export const markdownYamlV1: SnapshotFormat = {
  id: MARKDOWN_YAML_V1,
  detect: (raw) => PAGE_HEADER.test(raw.text) && YAML_BLOCK.test(raw.text),
  parse,
};
