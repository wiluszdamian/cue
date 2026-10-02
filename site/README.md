# Cue site

The Cue landing page and its documentation, built with [Astro](https://astro.build).
It is a separate app: it is not part of the pnpm workspace and has its own install.

```bash
cd site
pnpm install --ignore-workspace
pnpm dev       # http://localhost:4321
pnpm build     # static output in site/dist
pnpm check     # astro check (types and templates)
```

## Layout

| Path                     | What it is                                      |
| ------------------------ | ----------------------------------------------- |
| `src/pages/index.astro`  | The landing page                                |
| `src/pages/docs/*.astro` | One file per docs page                          |
| `src/lib/docs.ts`        | Docs sidebar order, titles and descriptions     |
| `src/layouts/Base.astro` | Head, fonts, theme bootstrap, header and footer |
| `src/layouts/Docs.astro` | Sidebar, search, on-this-page index, prev/next  |
| `src/components/`        | Header, footer and the inline icon sprite       |
| `src/styles/global.css`  | Every style, built on the tokens at the top     |
| `public/brand/`          | The Cue logo as SVG, light and dark             |

To add a docs page, create `src/pages/docs/<slug>.astro` wrapped in
`<Docs slug="<slug>">` and add the same slug to `DOCS` in `src/lib/docs.ts`.

## Deploying

The build is plain static files. For GitHub Pages under the repository name,
build with the base path set:

```bash
SITE_BASE=/project-cue pnpm build
```

For a custom domain, leave `SITE_BASE` unset and set `SITE_URL`.

## Logo

`public/brand/` holds the full lockup (`cue-logo-*.svg`) and the mark alone
(`cue-mark-*.svg`), each in a light-mode and a dark-mode version.
