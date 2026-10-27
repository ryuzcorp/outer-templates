# Passkeys

Visitors create an account and sign back in with a passkey (Face ID,
fingerprint, or a hardware key) instead of a password. Sessions live in
D1 behind an `HttpOnly` cookie, and `/members` is only visible signed in.

There are no dependencies: verification is hand-rolled on Web Crypto
(`SubtleCrypto` + a small CBOR reader), which runs on workerd, Bun, and
browsers — so you add no packages.

## What `add_example` does

In one commit: copies `pages/*` (`sign-in` + `members` pages and server
modules, `_session.ts`, `_webauthn.ts`, `_ceremony.ts`, `_webauthn.test.ts`),
copies `db/migrations/0001_accounts.sql` (renumbered past your
migrations, never reused), and adds the nav lines to `pages/_nav.ts` with
fitting icons (`KeyRound` for sign-in, `Users` for members).

## Customise

- Rewrite the sign-in and members copy for the app.
- Gate your own pages like `members.server.ts` does: read the viewer
  with `getViewer(db, c.req.header("cookie") ?? null)` from
  `pages/_session.ts`, and `return c.redirect("/sign-in")` when null.
- Sign out with `POST /sign-in` intent `sign-out` (see `signOut()` in
  `pages/_ceremony.ts`); it deletes the session and clears the cookie.

## Without `add_example`

Call `examples passkeys` to get the files, then in one commit: copy
`pages/*` onto `pages/` and the migration into `db/migrations/` (renamed
past your highest number), and add the two nav lines with their icons.
Then `check`, `ship`, and `look_at_app`: open `/sign-in`, create an
account with your device's passkey, and reach `/members`.

## How it works

- `sign-in.server.ts` runs each ceremony step as an `intent`. Starts
  store a challenge in D1 (5-minute expiry, deleted on first use);
  finishes verify the device response and set the session cookie.
- `_webauthn.ts` checks challenge, origin, and rpId, accepts attestation
  `none`, and verifies ES256/RS256 signatures. rpId and origin come
  from the request host, so deploys and custom domains just work.
- `_session.ts` owns cookies and sessions: the cookie holds a random
  token, D1 keeps only its SHA-256 hash. `getViewer` is the who-am-I
  helper other pages import.

## Gotchas

- The cookie is `Secure` everywhere except plain-http loopback (local
  preview): `isSecureRequest` in `_session.ts` fails closed, so any
  non-localhost http still gets `Secure`. That is intended, not a bug.
- Clearing a cookie needs the same flags it was set with, so sign-out
  derives `Secure` from the request the same way. Keep the two in sync.
- Challenge rows are single-use: restarting a ceremony (or double
  tapping) invalidates the old one — the page starts a fresh challenge
  per attempt, so just try again.
- Synced passkeys barely move signatures: a steady zero stays valid,
  otherwise the count must move forward or the credential is rejected.
- Sign-up says "name taken" and sign-in says "no account" on purpose so
  visitors know which step to take — the tradeoff is that anyone can probe
  which names exist. That is accepted here; do not "fix" it by merging the
  messages unless the app's threat model needs it.
- Only `none` attestation and ES256/RS256 verify; anything else fails
  with the message the visitor sees. That covers every major platform
  when creation requests `attestation: "none"`, which this does.
