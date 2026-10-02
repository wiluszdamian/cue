import { defineConfig } from 'astro/config';

// SITE_URL and SITE_BASE let the same build serve from a custom domain ("/")
// or from GitHub Pages under the repository name ("/project-cue").
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://wiluszdamian.github.io',
  base: process.env.SITE_BASE ?? '/',
  trailingSlash: 'ignore',
});
