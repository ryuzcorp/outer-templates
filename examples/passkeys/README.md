# Passkeys

Visitors create an account and sign back in with a passkey (Face ID,
fingerprint, or a hardware key) instead of a password. Sessions live in
D1 behind an `HttpOnly` cookie, and `/members` is only visible signed in.

There are no dependencies: verification is hand-rolled on Web Crypto
(`SubtleCrypto` + a small CBOR reader), which runs on workerd, Bun, and
browsers — so you add no packages.

## Steps

1. Call `examples passkeys` to get the files, then copy each one onto
   your app at the same path in one `commit` (or `stage` them):
   `pages/*` to `pages/`, `db/migrations/0001_accounts.sql` to
   `db/migrations/`. Outer applies the migration when it deploys; never
   edit it afterwards, add a new migration.
2. If the app already has migrations, rename the file to the next free
   number (e.g. `0002_accounts.sql`) in the same commit.
3. Add the nav lines in `pages/_nav.ts` in the same commit, with fitting
   icons (`KeyRound` for sign-in, `Users` for members):
   `import { House, KeyRound, Settings, Users } from "lucide";`
   `{ href: "/sign-in", label: "Sign in", icon: KeyRound },`
   `{ href: "/members", label: "Members", icon: Users },`
   Any icon name from https://lucide.dev/icons works — just import it.
4. Run `check` before shipping (`stage` → `check` → `ship`, or one
   `commit`), then verify with `look_at_app`: open `/sign-in`, create an
   account with your device's passkey, and reach `/members`.
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
