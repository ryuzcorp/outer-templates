/// <reference types="astro/client" />

// The bindings server routes read through `import { env } from
// "cloudflare:workers"` (Astro 6+ removed `locals.runtime.env`). The shell
// is static and declares no bindings in `void.config.ts`; this `DB` entry
// is for the first server route that needs data, which adds the matching
// D1 binding — see the `newsletter` example. Keep this in sync with
// `void.config.ts` from that point on.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
  }
}
