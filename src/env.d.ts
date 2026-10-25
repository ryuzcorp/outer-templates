/// <reference types="astro/client" />

// What the Cloudflare adapter puts on `locals.runtime`: raw binding access
// in dev and production. Keep this in sync with `void.config.ts` — one D1
// database, and R2 only if the site declares one.
declare namespace App {
  interface Locals {
    runtime: {
      env: {
        DB: D1Database;
      };
    };
  }
}
