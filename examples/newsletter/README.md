# Newsletter example

Add an email signup to your site: a `NewsletterForm` island, one shared
validator, a `/api/newsletter` route backed by D1, a migration, and tests.

## What you get

- `src/islands/NewsletterForm.tsx` — static form first, hydrates in place.
- `src/lib/newsletter.ts` — one validation rule shared by island and route.
- `src/pages/api/newsletter.ts` — the POST route (with a CREATE TABLE backstop).
- `src/newsletter.test.tsx` — tests for validation, the route helpers, and the form.
- `db/migrations/0001_newsletter.sql` — the `newsletter` table.

## Steps

1. Call `examples newsletter` to get the files, then copy every file onto
   the same path in your site in one `commit` (or `stage` them). Outer
   applies the migration when it deploys; never edit it afterwards.
2. If your site already has migrations, rename the migration file to the
   next free number (for example `0002_newsletter.sql`) in the same
   commit — never reuse a number.
3. Render the form where you want signups. Import it, then place the tag:
   `import NewsletterForm from "../islands/NewsletterForm.tsx"` and
   `<NewsletterForm client:load />` (from a page one level under `src/pages/`).
4. Add the D1 database in `void.config.ts` in the same commit — the shell
   is static and declares no bindings, so the route has no database
   without this. Inside `cloudflare:`, next to `name`:
   `d1_databases: [{ binding: "DB", database_name: "site-db", migrations_dir: "db/migrations" }]`
   (`src/env.d.ts` already declares the `DB` binding, so no change needed
   there.)
5. Run `check` before shipping (`stage` → `check` → `ship`, or one
   `commit`), then verify with `look_at_app`: subscribe once with a real
   address and once with `not-an-email` to see both paths.

## Gotchas

- Without step 4 the route has no database: `env.DB` is undefined and
  subscribes fail. The shell declares no bindings, so the binding step is
  required, not optional. If you renamed the binding, update the route to
  match.
- Island props are JSON only — never forward an Astro `<slot />` into the form.
- The button stays disabled until the island hydrates, so a submit can never
  fall back to a GET that leaks the address into history and logs.
- The route only stores the address behind a same-origin check — before
  sending mail, confirm it with double opt-in (mail a confirmation link
  first). Never start bulk-sending to stored addresses unverified.
- An address already on the list still answers success: confirming a signup
  must not reveal who signed up.
- All messages and rules live in `src/lib/newsletter.ts` — fix wording there,
  never separately in the island and the route.
- The migration is `IF NOT EXISTS` and matches the route's backstop
  statement, so applying it twice (migration + first request) is harmless.
