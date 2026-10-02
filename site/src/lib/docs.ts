import { getCollection, type CollectionEntry } from 'astro:content';

export interface DocPage {
  /** Path under /docs without `.md`; '' for the index. */
  slug: string;
  title: string;
  group: string;
  description: string;
  entry: CollectionEntry<'docs'>;
}

/** `../docs/start/install.md` → `start/install`. */
function slugOf(entry: CollectionEntry<'docs'>): string {
  const file = (entry.filePath ?? `${entry.id}.md`).replace(/\\/g, '/');
  const rel = file.replace(/^.*?docs\//, '').replace(/\.md$/, '');
  return rel === 'index' ? '' : rel.replace(/\/index$/, '');
}

/** The `# Title` and the `_description_` line every page opens with. */
function headerOf(body: string): { title: string; description: string } {
  const title = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? '';
  const description = /^#\s+.+\n+_(.+)_\s*$/m.exec(body)?.[1]?.trim() ?? '';
  return { title, description };
}

/**
 * The sidebar comes from the "Everything here" list in docs/index.md, so adding
 * a page there is the only step needed to put it on the site. Pages the index
 * does not list (the generated rule pages, for one) are appended after it.
 */
function navFromIndex(body: string): { group: string; slug: string }[] {
  const section = body.split(/^## Everything here\s*$/m)[1] ?? '';
  const items: { group: string; slug: string }[] = [];
  let group = '';
  for (const line of section.split('\n')) {
    const heading = /^\*\*(.+)\*\*\s*$/.exec(line);
    if (heading) group = heading[1];
    const link = /^-\s+\[[^\]]+\]\(([^)#]+\.md)\)/.exec(line);
    if (link && group) items.push({ group, slug: link[1].replace(/\.md$/, '') });
  }
  return items;
}

let cache: DocPage[] | undefined;

/** Sidebar order, which is also the previous/next order. */
export async function getDocs(): Promise<DocPage[]> {
  if (cache) return cache;
  const entries = await getCollection('docs');
  const bySlug = new Map(entries.map((e) => [slugOf(e), e]));
  const page = (slug: string, group: string): DocPage | undefined => {
    const entry = bySlug.get(slug);
    if (!entry) return undefined;
    bySlug.delete(slug);
    return { slug, group, entry, ...headerOf(entry.body ?? '') };
  };

  const index = bySlug.get('');
  const pages: DocPage[] = [];
  const intro = page('', 'Getting started');
  if (intro) pages.push({ ...intro, title: 'Introduction' });
  for (const item of navFromIndex(index?.body ?? '')) {
    const p = page(item.slug, item.group);
    if (p) pages.push(p);
  }
  const rest = [...bySlug.keys()].sort();
  for (const slug of rest) {
    const p = page(slug, slug.startsWith('reference/rules/') ? 'Rule reference' : 'More');
    if (p) pages.push(p);
  }
  cache = pages;
  return pages;
}

export function groupsOf(pages: DocPage[]): string[] {
  return [...new Set(pages.map((p) => p.group))];
}
