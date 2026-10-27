# Photos — upload to R2 with a D1 feed

This example adds a photo-sharing page at `/photos`. Only signed-in
visitors can upload (images: JPEG, PNG, WebP, GIF, or AVIF, up to 10 MB,
with a caption). Each upload stores the file in R2 and one row in D1, and
the page shows a newest-first feed served through a caching image route.
Signed-out visitors see the feed and a "Sign in to post" link; their
uploads are answered 403.

## What `add_example` does

Applies `passkeys` first (uploads are gated on its sessions), then in one
commit: copies `pages/photos.tsx` (upload card + feed), `pages/photos.server.ts`
(loader, gated upload action), `routes/photos/[key].ts` (image route), and
`db/migrations/0001_photos.sql` (renumbered past your migrations, never
reused); adds the Photos line to `pages/_nav.ts` with the `Camera` icon;
adds the `PHOTOS` R2 bucket to `void.config.ts`.

## Customise

- Rewrite the page copy (`Photos`, the empty-feed text) for the app.
- Change the 10 MB cap or the accepted types in `IMAGE_TYPES` (both checks
  run on the server — update the magic-byte check to match).
- Point the sign-in link and the 403 message at your own auth if you ever
  replace `passkeys`.

## Without `add_example`

Call `examples photos` to get the files, then in one commit: copy each file
onto the same path (rename the migration past your highest number), apply
the `passkeys` example too (the page imports `getViewer` from its
`pages/_session.ts`), add the nav line (`Camera` icon) and the
`r2_buckets` binding from the sections below. Then `check`, `ship`, and
`look_at_app`: open `/photos`, upload an image, and see it at the top of
the feed; sign out and confirm the form becomes a sign-in link.

## Gotchas

- Both size (10 MB) and type checks run on the server — the file
  picker and the `accept` list are conveniences, not security. The
  type check reads the file's magic bytes, so a renamed script is
  rejected even when the browser claims it is an image.
- Image URLs contain a random key per upload, so the route caches them for
  a year. Re-uploading the same picture creates a new URL.
- If the `PHOTOS` binding is missing, the page shows a setup message
  and uploads answer 500 instead of crashing.
- The image route only serves keys recorded in D1, so nobody can use
  it to probe other bucket contents.
