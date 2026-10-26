import { Link } from "@ilha/void";
import { ErrorBoundary } from "ilha";
import type { View } from "ilha";

import { appBrand, initials, onAccent } from "./_brand.ts";
import "./app.css";
// /guide/auto-update (SSR/SSG): no index.html entry point, so register the
// service worker via dynamic import guarded by `typeof window` — this never
// runs during server rendering, only in the hydrated client.
if (typeof window !== "undefined") {
  import("./_pwa");
}

// The brand mark: the same initials the build draws into the favicon, set in
// the brand accent with contrasting text.
export function BrandMark() {
  return (
    <span
      aria-hidden="true"
      class="flex h-9 w-9 items-center justify-center rounded-lg text-base font-bold"
      style={`background:${appBrand.accent};color:${onAccent(appBrand.accent)}`}
    >
      {initials(appBrand.name)}
    </span>
  );
}

// The error page: any subtree failure paints this instead of a blank crash.
// Same card style as the rest of the app.
function ErrorFallback({ reset }: { error: Error; reset(): void }) {
  return (
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body items-center gap-4 py-12 text-center">
        <h1 class="card-title text-2xl">Something broke</h1>
        <p class="opacity-70">
          This page hit an error. Your data is safe — try again, or start over.
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          <button type="button" onclick={() => reset()} class="btn btn-primary">
            Try again
          </button>
          <a href="/" class="btn btn-ghost">
            Home
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children?: View }) {
  return (
    // The accent is the primary color in both themes: daisyUI reads
    // `--color-primary` for every `btn-primary`, badge, and checkbox.
    <div
      class="flex min-h-dvh flex-col"
      style={`--color-primary:${appBrand.accent};--color-primary-content:${onAccent(appBrand.accent)}`}
    >
      <header class="navbar bg-base-100 shadow-sm">
        <div class="mx-auto flex w-full max-w-2xl items-center justify-between px-4">
          <Link href="/" class="btn btn-ghost flex items-center gap-2 px-2 text-lg">
            <BrandMark />
            {appBrand.name}
          </Link>
          {/* Desktop nav. Phones get the bottom tab bar below instead. */}
          <nav aria-label="Primary" class="hidden gap-1 sm:flex">
            <Link href="/" class="btn btn-ghost">
              Checklist
            </Link>
            <Link href="/settings" class="btn btn-ghost">
              Settings
            </Link>
          </nav>
        </div>
      </header>
      {/* Bottom padding clears the fixed tab bar on phones. */}
      <main class="mx-auto w-full max-w-2xl grow px-4 pt-8 pb-28 sm:pb-8">
        <ErrorBoundary fallback={ErrorFallback}>{children}</ErrorBoundary>
      </main>
      <footer class="footer footer-center bg-base-200 p-4 text-sm">
        {/* daisyUI makes footer children grids; `block` keeps the line inline. */}
        <p class="block">
          © {new Date().getFullYear()} {appBrand.name} · Built with{" "}
          <a class="link" href="https://ilha.build">
            Ilha
          </a>
        </p>
      </footer>
      {/* Phone tab bar. It floats above `env(safe-area-inset-bottom)` plus
        the Free-badge space the proxy reserves (`--outer-badge-space`): Pro
        pages never set the variable, so it falls back to 0. Never cover or
        restyle `#outer-badge` — it is Outer's, not the app's. */}
      <nav
        aria-label="Primary"
        class="fixed inset-x-0 z-40 border-t border-base-300 bg-base-100/95 backdrop-blur sm:hidden"
        style="bottom:calc(env(safe-area-inset-bottom) + var(--outer-badge-space, 0px))"
      >
        <div class="grid grid-cols-2 gap-1 p-2">
          <Link href="/" class="btn btn-ghost">
            Checklist
          </Link>
          <Link href="/settings" class="btn btn-ghost">
            Settings
          </Link>
        </div>
      </nav>
    </div>
  );
}
