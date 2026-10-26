/// <reference types="astro/client" />

// The bindings server routes read through `import { env } from
// "cloudflare:workers"` (Astro 6+ removed `locals.runtime.env`). Keep this
// in sync with `void.config.ts` — one D1 database, and R2 only if the site
// declares one.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
  }
}
