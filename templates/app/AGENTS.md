# AGENTS.md

You edit this app through Outer's MCP tools: `commit` with exact-match
`edits`, one idea per message. Outer runs `bun install` and `bun run build`,
then deploys. The call returns `success` with the URL, `failed` with the build
log, or `blocked` with the lines to fix. After touching server code, read
`app_logs`.

In a local checkout, `bun run fmt` formats the code (oxfmt) and
`bun run check` runs the typecheck, Oxlint, the format check and `bun test`.

## Files

- `brand.json` — the brand in one place: name, home-screen label,
  description, accent. Edit it to rename or rebrand; never the generated
  outputs (see `## Brand`).
- `pages/index.tsx` → `/`. The file path is the route; `_`-prefixed files
  are components, never routes.
- `pages/index.server.ts` — loader + action on D1. They run in the Worker.
- `pages/settings.tsx` → `/settings` — theme switch, install button, about.
- `middleware/01.not-found.ts` — the 404 page: rewrites HTML 404s to a
  branded document. A middleware, not a `[...path]` catch-all, so dev
  component sources (`/pages/*.tsx`) keep serving.
- `pages/_brand.ts` — reads `brand.json`; initials and contrast helpers.
- `pages/_checklist.ts` — the demo's shared rules (filters, validation).
- `pages/_pwa.ts` — service-worker registration + install-prompt hook.
- `scripts/brand.mjs` — draws `public/favicon.svg` from `brand.json` at
  config load. Never commit the generated SVG or icon PNGs.
- `pages/layout.tsx` — wraps every page: brand header, desktop nav, phone
  tab bar, tablet footer with the copyright line.
- `pages/app.css` — Tailwind + daisyUI (`light` default, `dark` for
  `prefers-color-scheme`); the accent becomes the primary color via CSS
  variables on the layout.
- `void.config.ts` — Worker name, document `head` (rendered from
  `brand.json`), bindings. Edits need `bun run build` (bindings and `head`
  are read from the built config).

## Ilha

A component is a function returning JSX. Primitives are order-based: call
`atom`/`watch` at the top level, in the same order every render — never in
`if`, loops, callbacks, or after `await`.

```tsx
import * as Atom from "effect/reactivity/Atom";
import { atom, watch } from "ilha";

export default function Counter({ start = 0 }: { start?: number }) {
  const count = atom(start); // read count(), write count.set(1)
  const doubled = atom(Atom.map(count.atom, (n) => n * 2)); // derived
  const startedAt = atom.lazy(() => Date.now()); // per-instance init
  watch.once(() => {
    // mount-only side effect; return a cleanup if needed
  });
  return (
    <button type="button" onclick={() => count.update((n) => n + 1)}>
      {count} / {doubled} (since {startedAt})
    </button>
  );
}
```

- `atom(value)` takes a value, an Effect atom, an Effect, or a Stream —
  never a plain function; use `atom.lazy(() => …)` for init or a stored
  function. Pass `handle.atom` to Effect APIs.
- Lowercase DOM names: `onclick`, `class`, `for`. Never `onClick`.
- `key` on every component returned from `.map()`. `yield* when(…)` only in
  a generator component. Never put JSX in atoms.
- Islands: name the page `*.island.tsx` (static HTML, no client JS except
  islands) and import with
  `import X from "./_x" with { island: "visible" }`. Island props are JSON
  only. On island pages use `useIslandForm()` from `@ilha/void`, not
  `useForm()`. Test with `renderHtml(Component)` from `ilha/test`.
- Every Ilha error carries a code (`ILHA002`), a `Fix:` line, and a link.

## Void

The checklist demo is the pattern to copy: `pages/index.server.ts` has a
loader that reads D1 (with a `?filter=` query param) and one action with
`add` / `toggle` / `edit` / `remove` intents; `pages/index.tsx` renders the
list with one `useForm` per form, and `pages/_checklist.ts` holds the
shared rules. Delete the demo in one commit when the app has real pages —
keep the loader/action/form shape. Filter tabs are plain links, so they
work without JavaScript.

```ts
// pages/index.server.ts
import { defineHandler } from "void";
import type { InferProps } from "void";

export type Props = InferProps<typeof loader>;
export const loader = defineHandler(async () => ({ items: [] }));
// One action per page; an `intent` field tells the forms apart.
export const action = defineHandler(async (c) => {
  const { intent, text } = await c.req.json<{ intent?: string; text?: string }>();
  if (intent === "add" && !text?.trim()) {
    return c.json({ errors: { text: "Write something first." } }, 422);
  }
  // ...mutate, then return nothing: Void re-runs the loader and applies
  // the page JSON in place. Returning data forces a full reload.
});
```

```tsx
import { Form, useForm } from "@ilha/void";

const add = useForm("/" as string, { intent: "add", text: "" });
// add.data.text, add.setData("text", v), add.errors.text, add.pending
```

- `422` with `{ errors: { field: "message" } }` fills the form's errors.
- `Link` from `@ilha/void` navigates without a reload:
  `<Link href="/about" prefetch>About</Link>`. `<a>` attributes pass
  through; `class` works.

## daisyUI

Style with daisyUI components (https://daisyui.com/components/), not
hand-rolled utility stacks: `navbar`, `card card-body card-title`, `btn
btn-primary btn-ghost btn-sm`, `input`, `join join-item`, `list list-row
list-col-grow`, `badge`, `alert alert-soft`, `fieldset`, `footer`,
`link`, `text-error`. Use Tailwind utilities only for layout (`flex`,
`gap-*`, `max-w-*`). Faint text is `opacity-70`, not gray utilities —
hardcoded colors break the `dark` theme. Only `light` and `dark` are
enabled (`pages/app.css`); switching themes needs no code.

## Phones first

Most people open their apps on a phone. Every page must work at 360px wide
before it looks good at desktop width:

- Keep the `charset` and `viewport` meta first in `void.config.ts` `head`.
  Without the viewport, phones render a zoomed-out 980px page.
- Stack by default, spread out from `sm:` up: `grid grid-cols-1
  sm:grid-cols-3`, `flex flex-col sm:flex-row`. Use `stats-vertical
  sm:stats-horizontal` for daisyUI stats.
- No fixed widths wider than the screen; long text gets `truncate` or
  `break-words`; wide tables sit in `overflow-x-auto`.
- Tap targets: `btn` (not `btn-xs`) for primary actions; inputs `w-full`.
- Use `min-h-dvh`, not `min-h-screen`, so mobile browser bars don't cut off
  the page.

## celld

- No module-scope state across requests in production: every request reads
  fresh state. `fetch` handlers only.
- No Workers AI, Vectorize, or Cache bindings.
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
- Tables in code (`pages/index.server.ts` starter) remain fine for tiny
  apps; the starter keeps its `CREATE TABLE IF NOT EXISTS` because `vite
  preview` runs no migrations.

`prepare()` takes one statement; `bind(...)` fills `?`; `all()` returns
`{ results }`, `first()` one row, `run()` writes. Verify against
https://void.cloud/guide/database and https://celld.dev/docs/services/d1/.

## Durable Objects

Declare classes under `durable_objects` in `void.config.ts`. Outer's
console lists each class's instances. To show what an instance holds, the
Worker answers `GET /do/<scope>?read=1`, where `<scope>` is the name you
pass to `idFromName`:

- Forward it to that object (`env.ROOMS.get(env.ROOMS.idFromName(scope))`)
  and return a small JSON snapshot of its state.
- Read only: `?read=1` must never create, change or count anything. Return
  404 for scopes you don't recognize.
- Keep it under 5 s and small; the console shows the first 2,000
  characters. Never include secrets or other people's data.

Without the route the console still lists instances; it just can't show
their contents.

## Brand

`brand.json` is the one place that names the app: `name`, `shortName`
(home-screen label), `description`, `accent`. Edit it to rename or
rebrand — never the generated outputs. The build renders it into the
document head (`void.config.ts`), the PWA manifest (`vite.config.ts`), the
header, the footer, and the favicon (`scripts/brand.mjs` draws
`public/favicon.svg` from it at config load; `pwaAssets` regenerates the
PNGs every build). After changing it, run `bun run build` so the icons and
manifest pick it up.

Free apps show an `outer.now` badge: Outer's proxy appends
`<a id="outer-badge">` to every HTML page and sets
`--outer-badge-space`. Keep fixed bottom UI (the tab bar, toasts, cookie
bars) clear of it with `bottom: calc(env(safe-area-inset-bottom) +
var(--outer-badge-space, 0px))` — Pro pages never set the variable, so it
falls back to 0. Never hide, cover, or restyle `#outer-badge`.

## PWA

Every app is installable: `vite-plugin-pwa` (`registerType: autoUpdate`,
`generateSW`) owns `manifest.webmanifest`, `sw.js`, and all icons, built
into `dist/client/` from the brand icon `public/favicon.svg` (generated
from `brand.json` — never commit the SVG, icon PNGs, or a hand-written
manifest). The SSR app has no index.html, so `pages/_pwa.ts` registers the
SW on the client and `void.config.ts` `head` carries the manifest/icon
links. Never set `navigateFallback` or precache HTML: navigations go to the
network so reloads always show fresh D1 data. Rename the app in
`brand.json`, not in `vite.config.ts` or `void.config.ts`.

## Page text

No strong profanity in page text, seed data, or SQL string literals — the
pre-live gate reads rendered text and literals. A blocked deploy never goes
live; the previous version keeps serving. Fix the flagged lines and commit
again.
