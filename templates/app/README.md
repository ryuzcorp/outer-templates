# Outer App

An [Outer](https://outer.now) app template: server-rendered
[Ilha](https://ilha.build) pages on [Void](https://void.cloud), built with
Vite and served by celld.

Every app starts as a copy of this repo (Outer’s `create_app` tool).
Agents change code with Outer’s `commit` tool — there is no `git push to
deploy`. Outer builds (`bun install` + `bun run build`) and deploys the
result to celld; the tool call returns `success` plus the URL, `failed`
plus the log tail, or `blocked` plus the offending lines to fix.

## Local development

```sh
bun install
bun run dev        # Vite dev server on http://localhost:5173
bun run fmt        # format with oxfmt
bun run check      # typecheck + lint + format check + tests
bun run build      # production build: dist/ + dist/wrangler.json
```

## Brand

`brand.json` at the repo root is the one place that names the app. The
build renders it into the document head, the PWA manifest, the header and
footer, and the favicon (regenerated from it at config load — never commit
`public/favicon.svg` or icon PNGs). Edit it to rebrand; run
`bun run build` so the icons and manifest pick it up.

## Pages

- `pages/index.tsx` — the `/` page: a branded landing with a neutral "nothing here yet" state.
- `pages/index.server.ts` — the head tags for `/`. Pages with data add a loader + action here.
- `pages/_nav.ts` — the nav in one place: Home and Settings. A new page is one route file plus one line here.
- `pages/settings.tsx` — theme switch, install button, and the brand values
  from `brand.json`.
- `middleware/01.not-found.ts` — the 404 page for unknown URLs (a
  middleware rewrite, so dev component sources keep serving).
- `pages/layout.tsx` — wraps every page: brand header, desktop nav, phone
  bottom tab bar (clears the Free `outer.now` badge via
  `--outer-badge-space`), tablet footer with the copyright line.
- `pages/app.css` — Tailwind + daisyUI (`light` by default, `dark` for
  `prefers-color-scheme`); the accent becomes the primary color.
- `void.config.ts` — the Worker: name, compatibility date, document
  `head` (rendered from `brand.json`: title, meta, Open Graph tags, PWA
  icon links, theme color), bindings.

## PWA

Every app is installable on phones by default. `vite-plugin-pwa`
(`registerType: 'autoUpdate'`, `generateSW`) owns the manifest, the service
worker, and all icons: they build into `dist/client/` (`/manifest.webmanifest`,
`/sw.js`) from the brand icon, which the build regenerates from
`brand.json` — no committed icon files. The service worker
precaches only hashed client assets + icons; navigations always go to the
network, so reloads show fresh D1 data. Rename the app in `brand.json`.

## Bindings

`void.config.ts` declares the Worker in its `cloudflare` section. The
template ships one D1 database with no tables yet — the first feature adds
its migration. Run `bun run build` after editing bindings (they are read
from the built config):

```ts
d1_databases: [{ binding: "DB", database_name: "app-db" }],
```

The platform provisions the database per app on first deploy. Outer applies
the committed `db/migrations/` files on deploy before the new code goes
live — never edit an applied migration, add a new one. Read the binding in
a server module with `env` from `cloudflare:workers`.

Secrets: set them as env vars on the app (Outer passes them to the build
and the fleet), never in `void.config.ts`.

## Stack

| Piece             | Version          |
| ----------------- | ---------------- |
| ilha / @ilha/void | ^0.16.0 / ^0.1.4 |
| void              | ^1.1.12          |
| daisyUI           | ^5               |
| effect            | ^4               |
| vite              | ^8               |
| vite-plugin-pwa   | ^2               |

## License

[MIT-0](./LICENSE): copy it into your app, no attribution needed.
