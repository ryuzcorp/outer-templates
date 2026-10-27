// The Worker, declared for Void (https://void.cloud): bindings and defaults
// in one typed file. `voidPlugin()` reads it and the Cloudflare adapter
// uses it (via the generated `.void-wrangler.jsonc`) during build; Outer
// applies the committed `db/migrations` files on deploy before the new code
// goes live.
import { defineConfig } from "void/config";

export default defineConfig({
  cloudflare: {
    // The Worker name celld serves the site as.
    name: "outer-website",
    // `nodejs_als` is required for `void/*` runtime helpers in Astro
    // (https://void.cloud/integrations/frameworks/astro).
    compatibility_flags: ["nodejs_als"],
    // The site's D1 database, provisioned by Outer on first deploy. Server
    // routes (`prerender = false`) read it via `import { env } from
    // "cloudflare:workers"` — see the `newsletter` example. `migrations_dir`
    // is the repo folder `void db generate` writes and `void db migrate`
    // (and dev-server startup) applies locally.
    d1_databases: [{ binding: "DB", database_name: "site-db", migrations_dir: "db/migrations" }],
  },
  worker: {
    compatibility_date: "2026-09-01",
  },
});
