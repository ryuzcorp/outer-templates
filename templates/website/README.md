# Outer Website

An [Outer](https://outer.now) website template: prerendered
[Astro](https://astro.build) pages with [Ilha](https://ilha.build) islands,
deployed the [Void](https://void.cloud) way on celld.

Every site starts as a copy of this repo (Outer’s `create_app` tool with
`template: "website"`). Agents change code with Outer’s `commit` tool —
there is no `git push to deploy`. Outer builds (`bun install` +
`bun run build`) and deploys the result to celld; the tool call returns
`success` plus the URL, `failed` plus the log tail, or `blocked` plus the
offending lines to fix.

Pick this template for content sites: landing pages, portfolios, blogs,
event pages. Pick the `app` template for anything with accounts, live
state, or dashboards.

## Local development

```sh
bun install
bun run dev        # Astro dev server on http://localhost:4321
bun run fmt        # format with oxfmt
bun run check      # typecheck + lint + format check + tests
bun run build      # prerender to dist/ + dist/wrangler.json (no Worker bundle until a server route exists)
```

## Brand

`brand.json` at the repo root is the one place that names the site. The
build renders it into every head tag, the header and footer, and the
favicon + link-preview card (regenerated from it at config load — never
commit `public/favicon.svg` or `public/og.svg`). Edit it to rebrand; run
`bun run build` so the icons pick it up.

## Pages

- `src/pages/index.astro` — the `/` page: a branded landing with a neutral
  "nothing here yet" state.
- `src/pages/404.astro` — unknown URLs.
- `src/pages/rss.xml.ts` + `src/pages/sitemap.xml.ts` — the feed and
  sitemap, prerendered (set `SITE_URL` when the site has its own domain).
  The `blog` example fills them with posts.
- `src/islands/` — interactive Ilha components, hydrated with `client:*`.
- `src/layouts/Base.astro` — wraps every page: brand head tags (charset
  and viewport first), header with the brand mark, footer.
- `src/styles/global.css` — Tailwind + daisyUI (`light` by default, `dark`
  for `prefers-color-scheme`); the accent becomes the primary color.

## Content

Posts live in `src/content/posts/` as Markdown with `title`, `description`
and `date` frontmatter; `draft: true` keeps a post out of the build. The
schema is `src/content.config.ts`. The folder starts empty — the `blog`
example adds the first posts.

## Database

The site keeps one D1 database (`void.config.ts`, `d1_databases`) with no
tables yet — the first server route adds its migration. Read the binding
in a server route with `env.DB` from `cloudflare:workers` (see the
`newsletter` example). Never edit an applied migration — add a new one
with `void db generate`.

Secrets: set them as env vars on the site (Outer passes them to the build
and the fleet), never in `void.config.ts`.

## Stack

| Piece               | Version |
| ------------------- | ------- |
| astro               | ^7      |
| ilha                | ^0.16.0 |
| @ilha/astro         | ^0.4.0  |
| @astrojs/cloudflare | ^14     |
| void                | ^1.2.1  |
| daisyUI             | ^5      |
| effect              | ^4      |

## License

[MIT-0](./LICENSE): copy it into your site, no attribution needed.
