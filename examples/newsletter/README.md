# Newsletter example

Add an email signup to your site: a `NewsletterForm` island, one shared
validator, a `/api/newsletter` route backed by D1, a `/subscribe` page
that renders the form, a migration, and tests.

## What `add_example` does

In one commit: copies `src/islands/NewsletterForm.tsx`,
`src/lib/newsletter.ts`, `src/pages/api/newsletter.ts`,
`src/pages/subscribe.astro`, `src/newsletter.test.tsx`, and
`db/migrations/0001_newsletter.sql` (renumbered past your migrations,
never reused); adds the D1 database to `void.config.ts` (`DB` /
`site-db`), which the shell omits — the route has no database without it.

## Customise

- Rewrite the form copy and the success message in
  `src/lib/newsletter.ts` — all wording lives there, never separately in
  the island and the route.
- Render the form where you want signups: `import NewsletterForm from
  "../islands/NewsletterForm.tsx"` and `<NewsletterForm client:load />`
  (from a page one level under `src/pages/`). Make `/subscribe` the
  linked page, or move the form onto your home page.

## Without `add_example`

Call `examples newsletter` to get the files, then in one commit: copy
every file onto the same path (rename the migration past your highest
number) and add the D1 binding in `void.config.ts` next to `name`:
`d1_databases: [{ binding: "DB", database_name: "site-db", migrations_dir: "db/migrations" }]`
(`src/env.d.ts` already declares the `DB` binding, so no change needed
there.) Then `check`, `ship`, and `look_at_app`: open `/subscribe`,
subscribe once with a real address and once with `not-an-email` to see
both paths.

## Gotchas

- Without the D1 binding the route has no database: `env.DB` is undefined
  and subscribes fail. The shell declares no bindings, so the binding step
  is required, not optional. If you renamed the binding, update the route
  to match.
- Island props are JSON only — never forward an Astro `<slot />` into the form.
- The button stays disabled until the island hydrates, so a submit can never
  fall back to a GET that leaks the address into history and logs.
- The route only stores the address behind a same-origin check — before
  sending mail, confirm it with double opt-in (mail a confirmation link
  first). Never start bulk-sending to stored addresses unverified.
- An address already on the list still answers success: confirming a signup
  must not reveal who signed up.
- The migration is `IF NOT EXISTS` and matches the route's backstop
  statement, so applying it twice (migration + first request) is harmless.
