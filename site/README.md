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

| Path                             | What it is                                          |
| -------------------------------- | --------------------------------------------------- |
| `src/pages/index.astro`          | The landing page                                    |
| `src/pages/docs/[...slug].astro` | One route per file in the repository's `/docs`      |
| `src/content.config.ts`          | Loads `../docs/**/*.md` as a content collection     |
| `src/lib/docs.ts`                | Sidebar order and titles, read from `docs/index.md` |
| `src/lib/remark-docs.mjs`        | Links, callouts and code titles for the site        |
| `src/layouts/Base.astro`         | Head, fonts, theme bootstrap, header and footer     |
| `src/layouts/Docs.astro`         | Sidebar, search, on-this-page index, prev/next      |
| `src/components/`                | Header, footer and the inline icon sprite           |
| `src/styles/global.css`          | Every style, built on the tokens at the top         |
| `public/brand/`                  | The Cue logo as SVG, light and dark                 |

The docs have one source: the markdown in `/docs`. The site never keeps its own
copy, so a change there shows up on the next build. Each page's `# Title` and
`_description_` become the page header, relative `.md` links become site links,
and `<Callout>` blocks become notes and warnings.

To add a docs page, write the markdown under `/docs` and list it under
"Everything here" in `docs/index.md`; that list is the sidebar. Pages it leaves
out still get built and land at the end of the sidebar.

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
