// The photos page's server module: a loader for the newest-first feed and
// one action that validates the upload, stores the file in R2, and records
// one D1 row per photo. Bindings come from `env` (`cloudflare:workers`);
// the page never touches R2 or D1 directly.
import { env } from "cloudflare:workers";
import { defineHandler, defineHead } from "void";
import { ValidationError } from "void/handler";
import type { InferProps } from "void";

export type Props = InferProps<typeof loader>;

export const head = defineHead(() => ({
  title: "Photos",
  meta: [
    { name: "description", content: "Share photos and browse the feed." },
    { property: "og:title", content: "Photos" },
  ],
}));

// The template has no generated Env augmentation, so name the two bindings
// this page needs. PHOTOS stays optional: the page shows a setup message
// (and the action answers 500) when the R2 binding is missing instead of
// crashing on `undefined`.
interface PhotoBindings {
  DB: D1Database;
  PHOTOS?: R2Bucket;
}

const bindings = env as unknown as PhotoBindings;

// Reject everything the phone's picker could hand you except real image
// types, and cap uploads at 10 MB. Both checks run here on the server —
// never trust the client. The extension comes from this map, not the
// uploaded file name.
const MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

interface PhotoRow {
  key: string;
  caption: string;
  content_type: string;
  created_at: string;
}

export const loader = defineHandler(async () => {
  const { results } = await bindings.DB.prepare(
    "SELECT key, caption, content_type, created_at FROM photos ORDER BY id DESC LIMIT 100",
  ).all<PhotoRow>();
  return { photos: results, storageReady: Boolean(bindings.PHOTOS) };
});

export const action = defineHandler(async (c) => {
  if (!bindings.PHOTOS) {
    return c.json(
      { message: "Photo storage is not configured. Add the r2_buckets binding, then redeploy." },
      500,
    );
  }
  const body = await c.req.parseBody();
  const caption = typeof body["caption"] === "string" ? body["caption"].trim().slice(0, 280) : "";
  const file = body["photo"];
  if (!(file instanceof File) || file.size === 0) {
    throw new ValidationError({ photo: "Choose an image to upload first." });
  }
  if (file.size > MAX_BYTES) {
    throw new ValidationError({ photo: "That file is bigger than 10 MB. Pick a smaller image." });
  }
  const ext = IMAGE_TYPES[file.type];
  if (!ext) {
    throw new ValidationError({ photo: "Upload a JPEG, PNG, WebP, GIF, or AVIF image." });
  }
  // The key is random per upload, so browsers can cache each image forever.
  const key = `${crypto.randomUUID()}.${ext}`;
  await bindings.PHOTOS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await bindings.DB.prepare("INSERT INTO photos (key, caption, content_type) VALUES (?, ?, ?)")
    .bind(key, caption, file.type)
    .run();
  // No return: Void re-runs the loader and the new photo appears in place.
});
