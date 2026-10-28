// The Worker, declared for Void (https://void.cloud): bindings and defaults
// in one typed file. `voidPlugin()` reads it and the Cloudflare adapter
// uses it (via the generated `.void-wrangler.jsonc`) during build; Outer
// applies the committed `db/migrations` files on deploy before the new code
// goes live.
//
// This shell is a static asset-only site: it declares no Worker bindings.
// (An asset-only project with Worker bindings fails its first deploy on
// celld.) The first server route that needs data adds the D1 binding back —
// see the `newsletter` example.
import { defineConfig } from "void/config";

export default defineConfig({
  cloudflare: {
    // The Worker name celld serves the site as.
    name: "outer-website",
    // `nodejs_als` is required for `void/*` runtime helpers in Astro
    // (https://void.cloud/integrations/frameworks/astro).
    compatibility_flags: ["nodejs_als"],
    // Unknown paths serve the built 404 page (`src/pages/404.astro`) with a
    // real HTTP 404 instead of a plain "Not found" text answer.
    assets: { not_found_handling: "404-page" },
    // outer:bindings — add_example inserts bindings above this line
  },
  worker: {
    compatibility_date: "2026-09-01",
  },
});
