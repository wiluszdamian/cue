import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import remarkDocs from './src/lib/remark-docs.mjs';

const base = process.env.SITE_BASE ?? '/';
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://wiluszdamian.github.io',
  base,
  trailingSlash: 'ignore',
  markdown: {
    shikiConfig: { theme: 'github-dark-dimmed' },
    remarkPlugins: [
      [
        remarkDocs,
        {
          base,
          repoRoot,
          docsDir: fileURLToPath(new URL('../docs', import.meta.url)),
          repoUrl: 'https://github.com/wiluszdamian/cue',
        },
      ],
    ],
  },
  vite: {
    // The docs live one level up, in the repository's /docs.
    server: { fs: { allow: ['..'] } },
  },
});
