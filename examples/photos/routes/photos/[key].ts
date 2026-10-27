// Serves one uploaded photo: GET /photos/<key> streams the bytes from R2.
// The content type comes from the D1 row, never from stored metadata, and
// only keys this app minted (uuid + image extension, present in D1) resolve.
// Keys are random per upload, so the long immutable cache is safe.
import { env } from "cloudflare:workers";
import { defineHandler } from "void";

const KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|avif)$/;

// The only types the upload action accepts (see IMAGE_TYPES in
// `pages/photos.server.ts`). Re-checked here at serve time: a row whose
// type is not on this list serves as a download, never inline.
const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

interface PhotoBindings {
  DB: D1Database;
  PHOTOS?: R2Bucket;
}

const bindings = env as unknown as PhotoBindings;

export const GET = defineHandler(async (c) => {
  if (!bindings.PHOTOS) {
    return c.text("Photo storage is not configured.", 500);
  }
  const key = c.req.param("key") ?? "";
  if (!KEY_PATTERN.test(key)) {
    return c.notFound();
  }
  const row = await bindings.DB.prepare("SELECT content_type FROM photos WHERE key = ?")
    .bind(key)
    .first<{ content_type: string }>();
  if (!row) {
    return c.notFound();
  }
  const object = await bindings.PHOTOS.get(key);
  if (!object) {
    return c.notFound();
  }
  const headers = new Headers();
  if (IMAGE_CONTENT_TYPES.has(row.content_type)) {
    headers.set("Content-Type", row.content_type);
  } else {
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", "attachment");
  }
  headers.set("Content-Length", String(object.size));
  // Some stores answer without an ETag — only send the header when the
  // object actually has one, instead of caching a bogus value.
  if (object.httpEtag) {
    headers.set("ETag", object.httpEtag);
  }
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
});
