# AGENTS.md

## Start here

This site is an empty, branded shell — build what your user asked for.
There is no demo to remove and no starter copy to delete.

- Pages are files: `src/pages/index.astro` → `/`. A new page is a new file.
- Data: add `db/migrations/0001_<what>.sql` (never edit an applied
  migration); server routes read it with `env.DB` from `cloudflare:workers`.
- Rename or rebrand only in `brand.json`.
- Copy proven patterns from examples: call the Outer tool `examples`
  to list them, and `examples {name}` to get the files to copy.
  - `blog` — content-collection posts with an index, reading time, and RSS.
  - `newsletter` — an email signup island with a D1-backed API route.
  - `landing` — hero, feature grid, testimonial, FAQ, and CTA sections.
- Commit small and check the result with `look_at_app`.

You edit this site through Outer's MCP tools — you have no shell. Put file
contents in `commit` (ships at once) or `stage` them, then run `check`
(install, typecheck, lint, and tests in Outer's sandbox), then `ship`.
Outer applies `db/migrations/*.sql` on deploy and returns `success` with
the URL, `failed` with the log, or `blocked` with the lines to fix. After
touching server code, read `app_logs`; verify visuals with `look_at_app`
and console errors with `app_errors`.

## Which template?

- **Website** (this repo): content sites — landing pages, portfolios, blogs,
  event pages. Mostly static, prerendered HTML; Astro routing; islands for
  the interactive parts; at most one server route or two talking to D1.
- **App** (the `app` template): anything with accounts, live state,
  dashboards, or more than one database table.

If the site grows accounts or live collaboration, say so: it wants the app
template, not more islands.

- `brand.json` — the brand in one place. Edit it to rebrand; never the
  generated outputs (see `## Brand`).
- `src/pages/` → routes. Files, not config, are the router. `rss.xml.ts`
  → `/rss.xml`, `sitemap.xml.ts` → `/sitemap.xml`, `404.astro` → unknown
  URLs. List new pages in `sitemap.xml.ts`.
- `src/content/posts/*.md` + `src/content.config.ts` — the collection. Each
  post needs `title`, `description`, `date`; `draft: true` stays out of the
  build. Empty until the `blog` example adds posts.
- `src/lib/brand.ts` — reads `brand.json`; titles, initials, contrast. `src/lib/posts.ts` — post slugs
  (the `blog` example extends it). `src/lib/site.ts` — the public origin for feed/sitemap links.
- `src/islands/*.tsx` — interactive Ilha components, hydrated where the page says (`client:load`, `client:idle`,
  `client:visible`).
- `src/layouts/Base.astro` — wraps every page: head tags, header, footer.
- `src/styles/global.css` — Tailwind + daisyUI (`light` + `dark`).

An island is a plain Ilha component (same `atom`/`watch` rules as ever:
primitives at the top level, in the same order every render — never in
`if`, loops, callbacks, or after `await`). The page decides when it wakes:

```astro
---
import Signup from "../islands/Signup.tsx";
---
<Signup client:load />
```

- `client:load` — above the fold. `client:idle` or `client:visible` —
  below it. `client:only` — skip SSR, mount fresh.
- Island props are JSON only. **Never forward an Astro `<slot />` into an
  island** — Ilha components don't support slot forwarding.
- The island renders as static HTML first; `client:*` hydrates it in place.
  Until hydration, handlers don't exist — keep controls usable or disabled,
  never silently dead. Test with `renderHtml(Component)` from `ilha/test`.

## Content

Posts are Markdown with frontmatter; the collection schema is the contract
(`src/content.config.ts`). The feed and sitemap prerender too — both need
absolute links, so set `SITE_URL` when the site has its own domain. Images
go in `public/` and are referenced by absolute path (`/photo.jpg`).

## Prerender vs server routes

Pages prerender by default — no server runs for them. A route that needs
bindings opts out with `export const prerender = false` (without it, the
route renders once at build time, where bindings don't exist). Read
bindings only through `import { env } from "cloudflare:workers"`;
`Astro.locals.runtime.env` was removed in Astro 6 and throws at runtime.
Declare new bindings on `Cloudflare.Env` in `src/env.d.ts`. Keep server
routes few and small: one D1 database, one R2 bucket per site. Anything
shaped like an app belongs in the app template.

## daisyUI

Use daisyUI components (https://daisyui.com/components/), not hand-rolled
utilities: `navbar`, `card card-body card-title`, `btn btn-primary
btn-ghost`, `input`, `join join-item`, `list list-row`, `badge`, `alert
alert-soft`, `link`, `text-error`. Tailwind is for layout only (`flex`,
`gap-*`, `max-w-*`). Faint text is `opacity-70` — never gray utilities,
which break the `dark` theme.

## Phones first

Every page must work at 360px wide before it looks good on desktop: keep
`charset` + `viewport` first in `head`; stack by default, spread out from
`sm:` up; no fixed widths wider than the screen (`truncate`,
`break-words`); `btn`-sized tap targets and full-width inputs; `min-h-dvh`,
not `min-h-screen`.

## celld

`session: false` in `astro.config.mjs` opts out of Astro sessions so the
build declares no SESSION KV namespace. No Workers AI, Vectorize, or Cache
bindings. No module-scope state across requests; prerendered pages are
static and server routes read fresh state per request. No outbound traffic
to loopback, private ranges, link-local, or metadata addresses; SMTP ports
25/465/587 are blocked — send mail through an HTTP API with a secret.
Stream large downloads instead of buffering them.

## D1

`env.DB` is on by default; Outer provisions it on first deploy. Schema
changes ride the deploy as committed files in `db/migrations/` (`void db
generate` writes `NNNN_name.sql`): Outer applies pending migrations before
the new code goes live, and a failing migration fails the deploy. Never
edit an applied migration — add a new one, expanding first (new tables,
nullable columns), because the migration runs while the old code serves.
`prepare()` takes one statement; `bind(...)` fills `?`.

## Brand

`brand.json` is the one place naming the site. The build renders it into
the head tags, header, footer, favicon, and OG card (`scripts/brand.mjs`
draws them at config load). After changing it, ship again so the deploy picks it up.
Free sites show an `outer.now` badge: this layout keeps nothing fixed at
the bottom, so there is nothing to clear — fixed bottom UI you add (cookie
bars, toasts) must offset with `var(--outer-badge-space, 0px)`. Never hide
or restyle `#outer-badge`.

## Deploy

Shipping builds the site: prerendered pages, the Worker bundle, and
`dist/wrangler.json` derived from the adapter's `dist/server/wrangler.json`.
Outer deploys `dist/` with celld. Never hand-write `dist/wrangler.json`
and never commit `.void-wrangler.jsonc` (generated from `void.config.ts`).

## Page text

No strong profanity in page text, seed data, or SQL string literals — the
pre-live gate reads rendered text and literals, and a blocked deploy never
goes live. Fix the flagged lines and commit again.
