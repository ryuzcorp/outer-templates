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
bun run build      # prerender + bundle: dist/ + dist/wrangler.json
```

## Pages

- `src/pages/index.astro` — the `/` page.
- `src/pages/blog/` — the Markdown blog (`index.astro` + `[slug].astro`).
- `src/pages/api/newsletter.ts` — a server route (`prerender = false`)
  that writes signups to D1. Replace it with the site's forms — don't keep
  the starter around.
- `src/islands/` — interactive Ilha components, hydrated with `client:*`.
- `src/layouts/Base.astro` — wraps every page: head tags (charset and
  viewport first), header, footer.
- `src/styles/global.css` — Tailwind + daisyUI (`light` by default, `dark`
  for `prefers-color-scheme`).

## Content

Posts live in `src/content/posts/` as Markdown with `title`, `description`
and `date` frontmatter; `draft: true` keeps a post out of the build. The
schema is `src/content.config.ts`.

## Database

The site keeps one D1 database (`void.config.ts`, `d1_databases`): the
newsletter table in `db/migrations/0001_newsletter.sql`. Read the binding
in a server route with `env.DB` from `cloudflare:workers` (see
`src/pages/api/newsletter.ts`). Never edit an applied migration — add a new
one with `void db generate`.

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
