# AGENTS.md

## Start here

This app is an empty, branded shell — build what your user asked for.
There is no demo to remove and no starter code to delete.

- Pages are `pages/<route>.tsx` + `pages/<route>.server.ts` (loader + action). List each page
  in `pages/_nav.ts` so it shows up in the header, sidebar, and phone tab bar.
- Data: add `db/migrations/0001_<what>.sql` (never edit an applied migration); read it with `env.DB`.
- Rename or rebrand only in `brand.json`.
- Copy proven patterns from examples: call the Outer tool `examples`
  to list them, and `examples {name}` to get the files to copy.
  - `list-form` — a D1-backed list with a server-validated form.
  - `passkeys` — visitor accounts: sign up and in with a passkey.
  - `photos` — photo upload to R2 with a feed.
- Commit small and check the result with `look_at_app`.

You edit this app through Outer's MCP tools: `commit` with exact-match `edits`, one idea per message.
Outer builds and deploys; the call returns `success` with the URL, `failed` with the log, or `blocked`
with the lines to fix. After touching server code, read `app_logs`. Locally, `bun run fmt` formats
and `bun run check` typechecks, lints, and tests.

## Files

- `brand.json` — the brand in one place. Edit it to rename or rebrand; never the generated outputs (see `## Brand`).
- `pages/index.tsx` → `/`. The file path is the route; `_`-prefixed files are helpers, never routes.
- `pages/index.server.ts` — the head tags for `/`. Pages with data add a loader + action here (see `list-form`).
- `pages/_nav.ts` — the nav in one place. A new page is one route file plus one line here.
- `pages/settings.tsx` → `/settings` — theme switch, install button, about.
- `middleware/01.not-found.ts` — the 404 page for unknown URLs (a middleware rewrite, so dev sources keep serving).
- `pages/_brand.ts` — reads `brand.json`; initials and contrast helpers.
- `pages/_pwa.ts` — service-worker registration + install-prompt hook.
- `scripts/brand.mjs` — draws `public/favicon.svg` from `brand.json` at config load. Never commit generated icons.
- `pages/layout.tsx` — wraps every page: header, desktop nav, phone tab bar, tablet footer. `app.css` is Tailwind + daisyUI.
- `void.config.ts` — Worker name, document `head` (from `brand.json`), bindings. Edits need `bun run build`.

## Ilha

Components are functions returning JSX. Primitives are order-based: call
`atom`/`watch` at the top level, in the same order every render — never in
`if`, loops, callbacks, or after `await`. Lowercase DOM names (`onclick`,
`class`); `key` on components from `.map()`; never JSX in atoms.

```tsx
import { atom, watch } from "ilha";

export default function Counter({ start = 0 }: { start?: number }) {
  const count = atom(start); // read count(), write count.set(1)
  watch.once(() => {}); // mount-only side effect; return a cleanup if needed
  return (
    <button type="button" onclick={() => count.update((n) => n + 1)}>
      {count}
    </button>
  );
}
```

- Island pages are `*.island.tsx`, imported with `import X from "./_x" with { island: "visible" }`; props are JSON
  only; island pages use `useIslandForm()`, not `useForm()`. Test with `renderHtml` from `ilha/test`.
- Every Ilha error carries a code (`ILHA002`), a `Fix:` line, and a link.

## Void

The `list-form` example is the pattern to copy: a loader reading D1, one
action with an `intent` per form, one `useForm` per form. Filter tabs are
plain links, so they work without JavaScript.

```ts
// pages/items.server.ts
import { defineHandler } from "void";

export const loader = defineHandler(async () => ({ items: [] }));
// One action per page; an `intent` field tells the forms apart.
export const action = defineHandler(async (c) => {
  const { intent, text } = await c.req.json<{ intent?: string; text?: string }>();
  if (intent === "add" && !text?.trim()) {
    return c.json({ errors: { text: "Write something first." } }, 422);
  }
  // ...mutate, then return nothing: Void re-runs the loader and applies the page JSON in place.
});
```

`422` with `{ errors: { field: "message" } }` fills the form's errors.
`Link` from `@ilha/void` navigates without a reload (`prefetch` optional).

## daisyUI

Use daisyUI components (https://daisyui.com/components/), not hand-rolled
utilities: `navbar`, `card card-body card-title`, `btn btn-primary
btn-ghost`, `input`, `join join-item`, `list list-row`, `badge`, `alert
alert-soft`, `fieldset`, `link`, `text-error`. Tailwind is for layout only
(`flex`, `gap-*`, `max-w-*`). Faint text is `opacity-70` — never gray
utilities, which break the `dark` theme.

## Phones first

Every page must work at 360px wide before it looks good on desktop: keep
`charset` + `viewport` first in `head`; stack by default, spread out from
`sm:` up; no fixed widths wider than the screen (`truncate`,
`break-words`, `overflow-x-auto` for tables); `btn`-sized tap targets and
full-width inputs; `min-h-dvh`, not `min-h-screen`.

## celld

No module-scope state across requests; `fetch` handlers only. No Workers
AI, Vectorize, or Cache bindings. No outbound traffic to loopback, private
ranges, link-local, or metadata addresses; SMTP ports 25/465/587 are
blocked — send mail through an HTTP API with a secret. Stream large
downloads instead of buffering them.

## D1

`env.DB` is on by default; Outer provisions it on first deploy. Schema changes ride the deploy as committed files
in `db/migrations/` (`void db generate` writes `NNNN_name.sql`): Outer applies pending migrations before the new
code goes live, and a failing migration fails the deploy. Never edit an applied migration — add a new one, expanding
first (new tables, nullable columns), because the migration runs while the old code serves.
`prepare()` takes one statement; `bind(...)` fills `?`.

## Durable Objects

Declare classes under `durable_objects` in `void.config.ts`. To show what an
instance holds, answer `GET /do/<scope>?read=1` with a small JSON snapshot:
forward to the object via `idFromName(scope)`, read-only (never create,
change, or count; 404 unknown scopes), under 5 s. Without the route the
console lists instances but can't show their contents.

## Brand

`brand.json` is the one place naming the app. The build renders it into the document head, the PWA manifest, the
header and footer, and the favicon (`scripts/brand.mjs` draws `public/favicon.svg` at config load; `pwaAssets`
regenerates PNGs every build). After changing it, run `bun run build`. Free apps show an `outer.now` badge: keep
fixed bottom UI clear of it with `var(--outer-badge-space, 0px)`; never hide or restyle `#outer-badge`.

## PWA

`vite-plugin-pwa` owns the manifest, service worker, and icons, built from
the brand icon into `dist/client/`. `pages/_pwa.ts` registers the SW (the
SSR app has no index.html); `void.config.ts` `head` carries the
manifest/icon links. Never set `navigateFallback` or precache HTML:
navigations hit the network so reloads show fresh D1 data.

## Page text

No strong profanity in page text, seed data, or SQL string literals — the
pre-live gate reads rendered text and literals, and a blocked deploy never
goes live. Fix the flagged lines and commit again.
