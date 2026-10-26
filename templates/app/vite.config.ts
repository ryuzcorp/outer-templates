import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { voidIlha } from "@ilha/void/plugin";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { voidPlugin } from "void";

import { faviconSvg } from "./scripts/brand.mjs";

/** The brand in one place: `brand.json` names the app. The build renders it
 * into the PWA manifest and regenerates `public/favicon.svg` from it, so
 * the icon always matches the name and accent. `new URL(..., import.meta.url)`
 * keeps working after Vite bundles this config to a temp file; `dirname`
 * would point at the temp dir instead of the app root. */
const brandUrl = new URL("./brand.json", import.meta.url);
const brand = JSON.parse(readFileSync(brandUrl, "utf-8")) as {
  name: string;
  shortName: string;
  description: string;
  accent: string;
};
// `public/` holds only generated files, so a fresh clone has no such folder.
mkdirSync(new URL("./public/", import.meta.url), { recursive: true });
writeFileSync(new URL("./public/favicon.svg", import.meta.url), faviconSvg(brand));

/** The app root: this config file's own directory. */
const APP_ROOT = import.meta.dirname;

/** Top-level keys `celld deploy` accepts. An unknown key fails the deploy,
 * so anything Void emits outside this set is dropped, never passed through. */
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
] as const;

/** Write the deploy-root `dist/wrangler.json` celld deploys, derived from
 * Void's own `dist/ssr/wrangler.json` (never handwritten): `main` rewrites
 * to deploy-root-relative `ssr/…`, the asset directory to `client`, and
 * `vars` to `{}` (Outer patches the app's real env at deploy time).
 * Void's Cloudflare-only `dist/client/.assetsignore` is removed: `celld
 * deploy` refuses it outright, and its entries need no replacement —
 * `wrangler.json` is celld's config surface (never an asset).
 * Last in the plugin list so its `closeBundle` runs after Void's emit; when
 * the SSR bundle hasn't closed yet it does nothing and the SSR close writes. */
const emitCelldConfig = (): Plugin => ({
  closeBundle() {
    const dist = path.resolve(APP_ROOT, "dist");

    rmSync(path.join(dist, "client", ".assetsignore"), { force: true });

    let emitted: string;

    try {
      emitted = readFileSync(path.join(dist, "ssr", "wrangler.json"), "utf-8");
    } catch {
      return;
    }

    const ssr = JSON.parse(emitted) as Record<string, unknown>;

    const ssrAssets =
      typeof ssr["assets"] === "object" && ssr["assets"] !== null
        ? (ssr["assets"] as Record<string, unknown>)
        : {};

    const ssrMain = typeof ssr["main"] === "string" && ssr["main"] ? ssr["main"] : "index.js";

    const config: Record<string, unknown> = {};

    for (const key of CELLD_KEYS) {
      if (key in ssr) {
        config[key] = ssr[key];
      }
    }

    config["main"] = `ssr/${ssrMain}`;
    config["assets"] = {
      ...ssrAssets,
      directory: "client",
      run_worker_first: true,
    };

    // D1 is keyed by name: every entry carries the repo's migrations folder
    // (`db/migrations`, where `void db generate` writes) so Outer, celld
    // and `void db` agree. Void rewrites the declared dir relative to its
    // own `dist/ssr/wrangler.json` (e.g. `../../db/migrations`), which is
    // wrong relative to this deploy root and fails Outer's validation (no
    // `.`/`..` segments), so resolve it back against the app root. A
    // missing value would mean Void's default `migrations`, which does not
    // exist — fall back to the template convention.
    if (Array.isArray(config["d1_databases"])) {
      for (const entry of config["d1_databases"]) {
        if (typeof entry === "object" && entry !== null) {
          const record = entry as Record<string, unknown>;
          const raw = record["migrations_dir"];
          let dir = "db/migrations";
          if (typeof raw === "string" && raw) {
            const rel = path.relative(APP_ROOT, path.resolve(dist, "ssr", raw));
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
          record["migrations_dir"] = dir;
        }
      }
    }

    config["vars"] = {};
    writeFileSync(path.join(dist, "wrangler.json"), `${JSON.stringify(config, null, 2)}\n`);
  },
  name: "celld-config",
});

export default defineConfig({
  build: {
    // No sourcemaps in production builds. Vite's own default is already
    // `false`, but @cloudflare/vite-plugin emits worker sourcemaps by
    // default (`getWorkerSourcemap` falls back to `true` unless Vite's
    // `build.sourcemap` or the Worker's `upload_source_maps` opts out) —
    // this opts the worker/SSR environment out too. celld uploads all of
    // dist/, so maps would ship to every deploy for no benefit.
    // https://vite.dev/config/build-options#build-sourcemap
    sourcemap: false,
  },
  plugins: [
    voidPlugin(),
    voidIlha(),
    tailwindcss(),
    // PWA: https://vite-pwa-org.netlify.app/guide/ — manifest, service
    // worker and icons are owned here; the SSR app has no index.html, so
    // registration is manual (see pages/_pwa.ts).
    VitePWA({
      // /guide/auto-update: a new SW takes control and reloads open tabs.
      // (clientsClaim + skipWaiting are forced by the plugin for autoUpdate.)
      registerType: "autoUpdate",
      // /guide/register-service-worker (Manual Registration): the SSR app
      // has no index.html for auto/script injection; pages/_pwa.ts
      // registers the SW on the client instead.
      injectRegister: null,
      // No service worker in `vite dev`.
      devOptions: { enabled: false },
      // /guide/pwa-minimal-requirements: the plugin generates
      // dist/client/manifest.webmanifest from this. Icons are injected by
      // pwaAssets (the plugin fills them in when the manifest omits them).
      manifest: {
        name: brand.name,
        short_name: brand.shortName,
        description: brand.description,
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: brand.accent,
        background_color: brand.accent,
      },
      // /assets-generator/integrations: build-time icons from the single
      // source public/favicon.svg (minimal-2023 preset by default).
      pwaAssets: { image: "public/favicon.svg" },
      workbox: {
        // No navigation fallback: pages are server-rendered and data is
        // live (the plugin defaults this to index.html, an SPA shell that
        // does not exist here). Navigations always go to the network, so a
        // reload always shows fresh D1 data and POSTs are never cached.
        navigateFallback: null,
        // /guide/static-assets (globPatterns): precache only the client
        // build's hashed assets plus generated icons/fonts — never HTML.
        // manifest.webmanifest is precached automatically (see
        // includeManifestIcons) and needs no pattern here.
        globPatterns: ["**/*.{js,css,png,svg,ico}"],
      },
    }),
    emitCelldConfig(),
  ],
});
