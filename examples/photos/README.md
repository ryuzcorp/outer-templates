# Photos — upload to R2 with a D1 feed

This example adds a photo-sharing page at `/photos`. Visitors upload an
image (JPEG, PNG, WebP, GIF, or AVIF, up to 10 MB) with a caption. Each
upload stores the file in R2 and one row in D1, and the page shows a
newest-first feed served through a caching image route.

What you get: `pages/photos.tsx` (upload card + feed),
`pages/photos.server.ts` (loader, upload action),
`routes/photos/[key].ts` (image route), and
`db/migrations/0001_photos.sql` (the `photos` table).

> Anyone who can reach `/photos` can upload through it: uploads are
> public unless gated. The page as copied here is for trusted audiences
> only — step 6 gates uploads behind sign-in, so do not skip it on the
> open internet.

## Steps

1. Call `examples photos` to get the files, then copy each one onto your
   app at the same path in one `commit` (or `stage` them):
   `pages/photos.tsx`, `pages/photos.server.ts`,
   `routes/photos/[key].ts`, and `db/migrations/0001_photos.sql`. Outer
   applies the migration when it deploys; never edit it afterwards.
2. If your app already has migrations in `db/migrations/`, rename the
   copied file to the next number (for example `0002_photos.sql`) in the
   same commit — never reuse a migration number.
3. Add the Photos line to `pages/_nav.ts` in the same commit, with the
   `Camera` icon:
   `import { Camera, House, Settings } from "lucide";`
   `{ href: "/photos", label: "Photos", icon: Camera },`
   Any icon name from https://lucide.dev/icons works — just import it.
4. Add the R2 bucket in `void.config.ts` in the same commit, next to the
   database: `r2_buckets: [{ binding: "PHOTOS", bucket_name: "photos" }]`
   inside `cloudflare:`. Keep the single bucket; the code reads it as
   `env.PHOTOS` from `cloudflare:workers`.
5. Run `check` before shipping (`stage` → `check` → `ship`, or one
   `commit`), then verify with `look_at_app`: open `/photos`, upload an
   image with a caption, and see it at the top of the feed.
6. Gate uploads behind sign-in: apply the `passkeys` example too, then
   open `canUpload` in `pages/photos.server.ts` (the marked gate) and
   check the viewer with `getViewer` from `pages/_session.ts`, the way
   `members.server.ts` does — return false for signed-out uploads, which
   the action answers with 403. Until then the page accepts uploads from
   anyone, so finish this step before shipping beyond trusted users.

## Gotchas

- Both size (10 MB) and type checks run on the server — the file
  picker and the `accept` list are conveniences, not security. The
  type check reads the file's magic bytes, so a renamed script is
  rejected even when the browser claims it is an image.
- Image URLs contain a random key per upload, so the route caches them
  for a year. Re-uploading the same picture creates a new URL.
- If the `PHOTOS` binding is missing, the page shows a setup message
  and uploads answer 500 instead of crashing.
- The image route only serves keys recorded in D1, so nobody can use
  it to probe other bucket contents.
