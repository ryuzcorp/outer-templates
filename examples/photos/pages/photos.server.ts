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

// `file.type` is the browser's claim, not a fact. Read the first bytes and
// match the signature for the claimed type, so a renamed script never
// becomes an unrenderable feed photo.
async function hasImageSignature(file: File, ext: string): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (from: number, to: number): string => String.fromCharCode(...head.slice(from, to));
  switch (ext) {
    case "jpg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "png":
      return (
        head[0] === 0x89 &&
        ascii(1, 4) === "PNG" &&
        head[4] === 0x0d &&
        head[5] === 0x0a &&
        head[6] === 0x1a &&
        head[7] === 0x0a
      );
    case "gif":
      return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
    case "webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "avif":
      return ascii(4, 8) === "ftyp" && ascii(8, 12) === "avif";
    default:
      return false;
  }
}

interface PhotoRow {
  key: string;
  caption: string;
  content_type: string;
  created_at: string;
}

// The table lives in `db/migrations/` (0001_photos.sql creates it): Outer
// applies the committed files on deploy. The CREATE below stays as a
// backstop — `vite preview` runs no migrations, so a fresh local DB would
// otherwise miss the table and the loader would 500. `IF NOT EXISTS`, so
// the two can never disagree.
async function ensurePhotosTable(): Promise<void> {
  await bindings.DB.prepare(
    "CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, caption TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
  ).run();
}

export const loader = defineHandler(async () => {
  await ensurePhotosTable();
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
  await ensurePhotosTable();
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
  if (!(await hasImageSignature(file, ext))) {
    throw new ValidationError({ photo: "That file is not a valid image. Pick another one." });
  }
  // The key is random per upload, so browsers can cache each image forever.
  const key = `${crypto.randomUUID()}.${ext}`;
  await bindings.PHOTOS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  try {
    await bindings.DB.prepare("INSERT INTO photos (key, caption, content_type) VALUES (?, ?, ?)")
      .bind(key, caption, file.type)
      .run();
  } catch (error) {
    // The image route only serves keys with a D1 row, so an object
    // without one is unreachable garbage — delete it before failing.
    await bindings.PHOTOS.delete(key);
    throw error;
  }
  // No return: Void re-runs the loader and the new photo appears in place.
});
