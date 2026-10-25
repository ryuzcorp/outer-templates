import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";
import ilha from "@ilha/astro";
import tailwindcss from "@tailwindcss/vite";
import { voidPlugin } from "void";

/** Top-level keys `celld deploy` accepts. An unknown key stops the deploy,
 * so anything the Cloudflare adapter emits outside this set is dropped,
 * never passed through. Keep this ⊆ Outer's ACCEPTED_CONFIG_KEYS
 * (crates/outer/src/deploy/pipeline.rs): the deploy-root config the site
 * deploys with must validate there. */
const CELLD_KEYS = [
  "$schema",
  "name",
  "main",
  "compatibility_date",
  "compatibility_flags",
  "durable_objects",
  "migrations",
  "assets",
  "services",
  "triggers",
  "vars",
  "d1_databases",
  "kv_namespaces",
  "queues",
  "workflows",
  "r2_buckets",
];

/** Write the deploy-root `dist/wrangler.json` celld deploys, derived from the
 * adapter's own `dist/server/wrangler.json` (never handwritten): `main`
 * rewrites to deploy-root-relative `server/…`, the asset directory to
 * `client`, and `vars` to `{}` (Outer patches the site's real env at deploy
 * time). `run_worker_first` stays unset: assets serve first, which suits a
 * mostly-static site (prerendered pages come straight from the asset layer;
 * only `/api/*` reaches the Worker). celld refuses
 * `dist/client/.assetsignore` outright, so it is removed — its entries need
 * no replacement (`wrangler.json` is celld's config surface, never an
 * asset). D1's `migrations_dir` resolves back to the repo folder, like the
 * app template: the adapter rewrites it relative to `dist/server/`
 * (`../../db/migrations`), which is wrong relative to this deploy root.
 * Runs on `astro:build:done`, after the adapter has written its config. */
const emitCelldConfig = () => ({
  name: "celld-config",
  hooks: {
    "astro:build:done": ({ dir }) => {
      const client = typeof dir === "string" && !dir.startsWith("file:") ? dir : fileURLToPath(dir);
      const dist = path.resolve(client, "..");

      rmSync(path.join(dist, "client", ".assetsignore"), { force: true });

      const emitted = readFileSync(path.join(dist, "server", "wrangler.json"), "utf-8");
      const adapter = JSON.parse(emitted);

      const adapterAssets =
        typeof adapter["assets"] === "object" && adapter["assets"] !== null
          ? adapter["assets"]
          : {};
      const adapterMain =
        typeof adapter["main"] === "string" && adapter["main"] ? adapter["main"] : "entry.mjs";

      const config = {};
      for (const key of CELLD_KEYS) {
        if (key in adapter) {
          config[key] = adapter[key];
        }
      }

      config["main"] = `server/${adapterMain}`;
      config["assets"] = { ...adapterAssets, directory: "client" };

      // D1 is keyed by name: every entry carries the repo's migrations
      // folder (`db/migrations`, where `void db generate` writes) so Outer,
      // celld and `void db` agree. A missing value would mean Void's default
      // `migrations`, which does not exist — fall back to the template
      // convention.
      if (Array.isArray(config["d1_databases"])) {
        for (const entry of config["d1_databases"]) {
          if (typeof entry === "object" && entry !== null) {
            const raw = entry["migrations_dir"];
            let dir = "db/migrations";
            if (typeof raw === "string" && raw) {
              const rel = path.relative(dist, path.resolve(dist, "server", raw));
              const posix = rel.split(path.sep).join("/");
              const segments = posix.split("/");
              if (
                posix &&
                !posix.startsWith("../") &&
                posix !== ".." &&
                segments.every((s) => s && s !== "." && s !== "..")
              ) {
                dir = posix;
              }
            }
            entry["migrations_dir"] = dir;
          }
        }
      }

      config["vars"] = {};
      writeFileSync(path.join(dist, "wrangler.json"), `${JSON.stringify(config, null, 2)}\n`);
    },
  },
});

// Astro + Ilha islands, deployed the Void way. `voidPlugin()` gives the
// build Void's resource detection (D1/KV/R2 bindings, migrations); the
// Cloudflare adapter reads its wrangler config from
// `./.void-wrangler.jsonc` (generated from `void.config.ts`, gitignored —
// never commit it) and emits the Worker + static assets into `dist/`.
// `session: false` opts out of Astro sessions so the adapter does not
// declare a SESSION KV namespace the site never uses; if the site needs
// sessions later, drop this and declare the KV namespace in
// `void.config.ts`.
export default defineConfig({
  output: "static",
  session: false,
  adapter: cloudflare({ configPath: "./.void-wrangler.jsonc" }),
  integrations: [ilha(), emitCelldConfig()],
  vite: {
    plugins: [voidPlugin(), tailwindcss()],
    build: {
      // No sourcemaps in production builds: celld uploads all of dist/,
      // so maps would ship to every deploy for no benefit.
      sourcemap: false,
    },
  },
});
