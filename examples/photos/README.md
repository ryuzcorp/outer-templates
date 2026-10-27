# Photos — upload to R2 with a D1 feed

This example adds a photo-sharing page to your app. Visitors upload an
image (JPEG, PNG, WebP, GIF, or AVIF, up to 10 MB) with a caption. Each
upload stores the file in R2 and one row in D1, and the page shows a
newest-first feed served through a caching image route.

What you get: `pages/photos.tsx` (upload card + feed),
`pages/photos.server.ts` (loader, upload action),
`routes/photos/[key].ts` (image route), and
`db/migrations/0001_photos.sql` (the `photos` table).

## Steps

1. Copy each file onto your app at the same path: `pages/photos.tsx`,
   `pages/photos.server.ts`, `routes/photos/[key].ts`, and
   `db/migrations/0001_photos.sql`.
2. If your app already has migrations in `db/migrations/`, rename the
   copied file to the next number (for example `0002_photos.sql`) —
   never reuse a migration number.
3. Open `pages/_nav.ts` and add the Photos line to `NAV`:
   `{ href: "/photos", label: "Photos", icon: "settings" }`.
   Reuse one of the two existing icon keys — a new key fails the build
   because its component lives in `layout.tsx`.
4. Open `void.config.ts` and add the R2 bucket next to the database:
   `r2_buckets: [{ binding: "PHOTOS", bucket_name: "photos" }]`
   inside `cloudflare:`. Keep the single bucket; the code reads it as
   `env.PHOTOS` from `cloudflare:workers`.
5. Run `bun run build`, then open `/photos`, pick an image, add a
   caption, and upload. Your photo appears at the top of the feed.

## Gotchas

- Both size (10 MB) and type checks run on the server — the file
  picker and the `accept` list are conveniences, not security.
- Image URLs contain a random key per upload, so the route caches them
  for a year. Re-uploading the same picture creates a new URL.
- If the `PHOTOS` binding is missing, the page shows a setup message
  and uploads answer 500 instead of crashing.
- The image route only serves keys recorded in D1, so nobody can use
  it to probe other bucket contents.
