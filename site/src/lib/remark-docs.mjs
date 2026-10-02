// Turns the repository's /docs markdown into site pages without changing the
// files themselves, so GitHub and the site render the same source:
//
// - the leading `# Title` and `_description_` move into the page header,
// - relative `.md` links become site URLs, other relative links point at GitHub,
// - `<Callout>` blocks become styled asides with their markdown intact,
// - a code fence's `title="..."` becomes a filename bar,
// - tables get a scrolling wrapper.
import path from 'node:path';

const CALLOUT = /^<Callout(?:\s+type="(\w+)")?\s*>([\s\S]*?)<\/Callout>\s*$/;
const LABELS = { note: 'Note', warn: 'Warning', tip: 'Tip' };

/**
 * @param {{ docsDir: string, base: string, repoRoot: string, repoUrl: string }} options
 */
export default function remarkDocs({ docsDir, base, repoRoot, repoUrl }) {
  const siteBase = base.replace(/\/$/, '');
  const processor = this;

  return (tree, file) => {
    const filePath = file.path ?? file.history?.[0];
    if (!filePath || !path.resolve(filePath).startsWith(path.resolve(docsDir))) return;

    stripHeader(tree);
    transformCallouts(tree, processor);
    walk(tree, (node) => {
      if (node.type === 'link' || node.type === 'definition') {
        node.url = rewriteUrl(node.url, filePath);
      }
      return undefined;
    });
    walk(tree, (node, index, parent) => {
      if (node.type === 'code' && node.meta) {
        const title = /title="([^"]+)"/.exec(node.meta)?.[1];
        if (title) {
          parent.children.splice(index, 0, {
            type: 'html',
            value: `<div class="code-title">${escapeHtml(title)}</div>`,
          });
          return index + 2;
        }
      } else if (node.type === 'table') {
        parent.children.splice(index, 1, { type: 'html', value: '<div class="table">' }, node, {
          type: 'html',
          value: '</div>',
        });
        return index + 3;
      }
      return undefined;
    });
  };

  function rewriteUrl(url, filePath) {
    if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#') || url.startsWith('/')) {
      return url;
    }
    const [target, hash = ''] = url.split(/(?=#)/);
    const absolute = path.resolve(path.dirname(filePath), target);
    const insideDocs = !path.relative(docsDir, absolute).startsWith('..');
    if (insideDocs && absolute.endsWith('.md')) {
      const slug = toSlug(path.relative(docsDir, absolute));
      return `${siteBase}/docs/${slug ? `${slug}/` : ''}${hash}`;
    }
    const fromRoot = path.relative(repoRoot, absolute).split(path.sep).join('/');
    return `${repoUrl}/blob/main/${fromRoot}${hash}`;
  }
}

/** `start/install.md` → `start/install`; `index.md` → ``. */
export function toSlug(relative) {
  const slug = relative.split(path.sep).join('/').replace(/\.md$/, '');
  return slug === 'index' ? '' : slug.replace(/\/index$/, '');
}

function stripHeader(tree) {
  const first = tree.children.findIndex((n) => n.type !== 'html' && n.type !== 'yaml');
  if (tree.children[first]?.type === 'heading' && tree.children[first].depth === 1) {
    tree.children.splice(first, 1);
    const next = tree.children[first];
    if (
      next?.type === 'paragraph' &&
      next.children.length === 1 &&
      next.children[0].type === 'emphasis'
    ) {
      tree.children.splice(first, 1);
    }
  }
}

function transformCallouts(tree, processor) {
  walk(tree, (node, index, parent) => {
    if (node.type !== 'html') return undefined;
    const match = CALLOUT.exec(node.value.trim());
    if (!match) return undefined;
    const kind = LABELS[match[1]] ? match[1] : 'note';
    const inner = match[2].replace(/^ {2}/gm, '').trim();
    const body = processor.parse(inner).children;
    parent.children.splice(index, 1, {
      type: 'blockquote',
      data: { hName: 'aside', hProperties: { className: ['callout', kind] } },
      children: [
        {
          type: 'paragraph',
          data: { hName: 'strong' },
          children: [{ type: 'text', value: LABELS[kind] }],
        },
        ...body,
      ],
    });
    return index + 1;
  });
}

/** Depth-first walk; the visitor may return the index to continue from. */
function walk(node, visit) {
  if (!node.children) return;
  for (let i = 0; i < node.children.length;) {
    const child = node.children[i];
    const next = visit(child, i, node);
    if (next === undefined) {
      walk(child, visit);
      i += 1;
    } else {
      i = next;
    }
  }
}

function escapeHtml(text) {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
}
