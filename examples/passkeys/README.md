# Passkeys

Visitors create an account and sign back in with a passkey (Face ID,
fingerprint, or a hardware key) instead of a password. Sessions live in
D1 behind an `HttpOnly` cookie, and `/members` is only visible signed in.

There are no dependencies: verification is hand-rolled on Web Crypto
(`SubtleCrypto` + a small CBOR reader), which runs on workerd, Bun, and
browsers — so you merge no packages.

## Install it

1. Copy every file onto the same path: `pages/*` to `pages/`,
   `db/migrations/0001_accounts.sql` to `db/migrations/`.
2. If the app already has migrations, rename the file to the next free
   number (e.g. `0002_accounts.sql`). Never edit an applied migration.
3. Add the nav lines in `pages/_nav.ts` (both reuse the `settings` icon,
   which already exists in `layout.tsx`):
   `{ href: "/sign-in", label: "Sign in", icon: "settings" },`
   `{ href: "/members", label: "Members", icon: "settings" },`
4. Run the dev server once so it applies the migration, then open
   `/sign-in` and create an account with your device's passkey.
5. Gate your own pages like `members.server.ts` does: read the viewer
   with `getViewer(db, c.req.header("cookie") ?? null)` from
   `pages/_session.ts`, and `return c.redirect("/sign-in")` when null.
6. Sign out with `POST /sign-in` intent `sign-out` (see `signOut()` in
   `pages/_ceremony.ts`); it deletes the session and clears the cookie.

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

- `Secure` cookies never reach `http://localhost`, so the cookie sets
  `Secure` on https only. Production stays `Secure`; local preview
  still signs in. That is in `sessionCookie`, not a bug.
- Clearing a cookie needs the same flags it was set with, so sign-out
  derives `Secure` from the request the same way. Keep the two in sync.
- Challenge rows are single-use: restarting a ceremony (or double
  tapping) invalidates the old one — the page starts a fresh challenge
  per attempt, so just try again.
- Synced passkeys barely count signatures: a steady zero stays valid,
  otherwise the count must move forward or the credential is rejected.
- Only `none` attestation and ES256/RS256 verify; anything else fails
  with the message the visitor sees. That covers every major platform
  when creation requests `attestation: "none"`, which this does.
