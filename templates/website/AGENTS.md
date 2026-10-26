# AGENTS.md

You edit this site with Outer's MCP tools: `commit` with exact-match
`edits`, one idea per message. Outer runs `bun install` and `bun run build`,
then deploys. The call returns `success` with the URL, `failed` with the
build log, or `blocked` with the lines to fix. After touching server code,
read `app_logs`.

In a local checkout, `bun run fmt` formats the code (oxfmt) and
`bun run check` runs the typecheck, Oxlint, the format check and `bun test`.

## Which template?

- **Website** (this repo): content sites — landing pages, portfolios, blogs,
  event pages. Mostly static, prerendered HTML; Astro routing; islands for
  the interactive parts; at most one server route or two talking to D1.
- **App** (the `app` template): anything with accounts, live state,
  dashboards, or more than one database table — server-rendered Ilha pages
  on Void (`pages/`, loaders + actions, `useForm`).

If the site grows accounts or live collaboration, say so: it wants the app
template, not more islands.

- `brand.json` — the brand in one place: name, home-screen label,
  description, accent. Edit it to rename or rebrand; never the generated
  outputs (see `## Brand`).
- `src/pages/` → routes. `index.astro` → `/`, `blog/index.astro` →
  `/blog`, `blog/[slug].astro` → `/blog/<slug>`, `api/newsletter.ts` →
  `/api/newsletter`, `rss.xml.ts` → `/rss.xml`, `sitemap.xml.ts` →
  `/sitemap.xml`, `about.astro` → `/about`, `404.astro` → unknown URLs.
  Files, not config, are the router — a new page is a new file.
- `src/content/posts/*.md` + `src/content.config.ts` — the blog. Each file
  needs `title`, `description`, `date`; `draft: true` stays out of the
  build. Delete the samples when the site has real posts.
- `src/lib/brand.ts` — reads `brand.json`; page titles, initials and
  contrast helpers. `src/lib/posts.ts` — slugs and reading time.
  `src/lib/site.ts` — the public origin for absolute feed/sitemap links
  (`SITE_URL`, else `https://outer.now`).
- `scripts/brand.mjs` — draws `public/favicon.svg` and `public/og.svg`
  from `brand.json` at config load. Never commit the generated files.
- `src/islands/*.tsx` — interactive Ilha components, hydrated where the
  page says (`client:load`, `client:idle`, `client:visible`).
- `src/layouts/Base.astro` — wraps every page: head tags, header, footer.
  Edit the title/description per page via its props.
- `src/lib/` — plain TypeScript shared between islands and server routes
  (validation lives in one place: `newsletterError`).
- `src/styles/global.css` — Tailwind + daisyUI (`light` default, `dark`
  for `prefers-color-scheme`).
- `astro.config.mjs` — adapter, integrations, and the `celld-config`
  integration that derives `dist/wrangler.json` (see `## Deploy`). Edits
  need `bun run build`.
- `void.config.ts` — Worker name, D1 binding, `nodejs_als`.
  `d1_databases` is the site's one database; Outer provisions it on first
  deploy.
- `public/favicon.svg` + `public/og.svg` — generated from `brand.json` at
  config load (see `scripts/brand.mjs`); never commit them.
- `db/migrations/` — D1 schema. `void db generate` writes `NNNN_name.sql`
  here; never edit an applied migration.

## Islands

An island is a plain Ilha component (same `atom`/`watch` rules as ever:
primitives at the top level, in the same order every render — never in
`if`, loops, callbacks, or after `await`). The page decides when it wakes:

```astro
---
import NewsletterForm from "../islands/NewsletterForm.tsx";
---
<NewsletterForm client:load />
```

- `client:load` — above the fold (the newsletter form). `client:idle` or
  `client:visible` — below it. `client:only` — skip SSR, mount fresh.
- Island props are JSON only. **Never forward an Astro `<slot />` into an
  island** — Ilha components don't support slot forwarding; pass data
  through props.
- The island renders as static HTML first; `client:*` hydrates it in place.
  Until hydration, handlers don't exist — keep controls usable or disabled,
  never silently dead.
- Test islands with `renderHtml(Component)` from `ilha/test`
  (`src/newsletter.test.tsx`).

## Content

Posts are Markdown with frontmatter; the collection schema is the contract
(`src/content.config.ts`). The blog index sorts newest first and skips
drafts; the `[slug]` route prerenders one page per post at build time, with
reading time from the raw body (`src/lib/posts.ts`). The feed
(`rss.xml.ts`) and sitemap (`sitemap.xml.ts`) prerender too — both need
absolute links, so set `SITE_URL` when the site has its own domain.
Images go in `public/` and are referenced by absolute path (`/photo.jpg`).

## Prerender vs server routes

Pages prerender by default — no server runs for them. A route that needs
bindings opts out:

```ts
// src/pages/api/newsletter.ts
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const POST: APIRoute = async () => {
  const { DB } = env;
  const { results } = await DB.prepare("SELECT id FROM newsletter").all();
  return Response.json({ count: results.length });
};
```

- `export const prerender = false` is the whole switch. Without it, the
  route is rendered once at build time, where bindings don't exist.
- Read bindings only through `import { env } from "cloudflare:workers"`.
  `Astro.locals.runtime.env` was removed in Astro 6 and throws at runtime.
  Declare new bindings on `Cloudflare.Env` in `src/env.d.ts`.
- Keep server routes few and small: one D1 database, one R2 bucket per site.
  Anything shaped like an app (auth, live state, many tables) belongs in
  the app template.

## daisyUI

Style with daisyUI components (https://daisyui.com/components/), not
hand-rolled utility stacks: `navbar`, `card card-body card-title`, `btn
btn-primary btn-ghost btn-sm`, `input`, `join join-item`, `list list-row
list-col-grow`, `badge`, `alert alert-soft`, `footer`, `link`,
`text-error`. Use Tailwind utilities only for layout (`flex`,
`gap-*`, `max-w-*`). Faint text is `opacity-70`, not gray utilities —
hardcoded colors break the `dark` theme. Only `light` and `dark` are
enabled (`src/styles/global.css`).

## Phones first

Most people open sites on a phone. Every page must work at 360px wide
before it looks good at desktop width:

- Keep the `charset` and `viewport` meta first in
  `src/layouts/Base.astro`. Without the viewport, phones render a
  zoomed-out 980px page.
- Stack by default, spread out from `sm:` up: `grid grid-cols-1
  sm:grid-cols-3`, `flex flex-col sm:flex-row`.
- No fixed widths wider than the screen; long text gets `truncate` or
  `break-words`.
- Tap targets: `btn` (not `btn-xs`) for primary actions; inputs `w-full`.
- Use `min-h-dvh`, not `min-h-screen`, so mobile browser bars don't cut off
  the page.

## celld

- `session: false` in `astro.config.mjs` opts out of Astro sessions so the
  build declares no SESSION KV namespace. If the site needs sessions, drop
  it and declare the KV namespace in `void.config.ts`.
- No Workers AI, Vectorize, or Cache bindings.
- No module-scope state across requests in production: prerendered pages
  are static, and server routes read fresh state per request.
- Outbound traffic never reaches loopback, private ranges, link-local, or
  metadata addresses; SMTP ports 25/465/587 are blocked — send mail through
  an HTTP API with a secret.
- Stream large downloads instead of buffering them into memory.

## D1

`env.DB` is on by default (`void.config.ts`, `d1_databases`); Outer
provisions it on first deploy. Schema changes ride the deploy as committed
migration files in `db/migrations/` (`void db generate` writes
`NNNN_name.sql`):

- Outer applies pending migrations on deploy, before the new code goes
  live. A failing migration fails the deploy; the previous version keeps
  serving.
- Never edit an applied migration — add a new one. Expand first (new
  tables, nullable columns): the migration runs while the old code still
  serves, so dropping a column the live code reads serves errors.
- Tables in code (the newsletter route's `CREATE TABLE IF NOT EXISTS`)
  stay as a backstop for local dev without migrations. Same statement as
  the migration, `IF NOT EXISTS`, so the two can never disagree.

`prepare()` takes one statement; `bind(...)` fills `?`; `all()` returns
`{ results }`, `first()` one row, `run()` writes. Verify against
https://void.cloud/guide/database and https://celld.dev/docs/services/d1/.

## Brand

`brand.json` is the one place that names the site: `name`, `shortName`
(home-screen label), `description`, `accent`. Edit it to rename or
rebrand — never the generated outputs. The build renders it into the head
tags (`src/layouts/Base.astro`: title, meta, Open Graph, `og:image`),
the header, the footer, and the favicon + OG card (`scripts/brand.mjs`
draws them at config load). After changing it, run `bun run build` so the
icons and the card pick it up; the demo landing copy still needs a manual
rewrite.

Free sites show an `outer.now` badge: Outer's proxy appends
`<a id="outer-badge">` to every HTML page and sets
`--outer-badge-space`. This layout keeps nothing fixed at the bottom, so
there is nothing to clear — if you add fixed bottom UI (cookie bars,
toasts), offset it with `bottom: calc(env(safe-area-inset-bottom) +
var(--outer-badge-space, 0px))`, which falls back to 0 on Pro pages. Never
hide, cover, or restyle `#outer-badge`.

## Deploy

`bun run build` prerenders the pages, bundles the Worker, and derives
`dist/wrangler.json` from the adapter's `dist/server/wrangler.json`
(`celld-config` in `astro.config.mjs`: allowlisted keys only, `main` →
`server/entry.mjs`, assets → `client`, `vars` → `{}`). Outer deploys `dist/`
with celld. Never hand-write `dist/wrangler.json` and never commit
`.void-wrangler.jsonc` (generated from `void.config.ts`).

## Page text

No strong profanity in page text, seed data, or SQL string literals — the
pre-live gate reads rendered text and literals. A blocked deploy never goes
live; the previous version keeps serving. Fix the flagged lines and commit
again.
