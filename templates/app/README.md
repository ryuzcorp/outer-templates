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

## Pages

- `pages/index.tsx` — the `/` page.
- `pages/index.server.ts` — loader + action: they run in the Worker, and
  the page reads them as props (`InferProps`) or calls them with `useForm`.
- `pages/layout.tsx` — wraps every page. The footer carries a small
  “Built with Ilha” link to https://ilha.build; remove it if you like.
- `pages/app.css` — Tailwind + daisyUI (`light` by default, `dark` for
  `prefers-color-scheme`).
- `void.config.ts` — the Worker: name, compatibility date, document
  `head` (PWA manifest/icon links, theme color, Open Graph tags), bindings.

## PWA

Every app is installable on phones by default. `vite-plugin-pwa`
(`registerType: 'autoUpdate'`, `generateSW`) owns the manifest, the service
worker, and all icons: they build into `dist/client/` (`/manifest.webmanifest`,
`/sw.js`) from the single source `public/favicon.svg` — edit the SVG and the
build regenerates matching PNGs, no committed icon files. The service worker
precaches only hashed client assets + icons; navigations always go to the
network, so reloads show fresh D1 data. Rename the app via `manifest` `name`
in `vite.config.ts` and `head` `title` in `void.config.ts`.

## Bindings

`void.config.ts` declares the Worker in its `cloudflare` section. The
template ships one D1 database, used by the starter page; run
`bun run build` after editing bindings (they are read from the built config):

```ts
d1_databases: [{ binding: "DB", database_name: "app-db" }],
```

The platform provisions the database per app on first deploy. Outer’s
deploy does NOT run migration files: create tables in code with
`CREATE TABLE IF NOT EXISTS` (see `pages/index.server.ts`). Read the binding in a server module
with `env` from `cloudflare:workers`.

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
