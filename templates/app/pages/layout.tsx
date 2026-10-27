import { Link, useRouter } from "@ilha/void";
import { ErrorBoundary } from "ilha";
import type { View } from "ilha";

import { NAV } from "./_nav.ts";
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

function HomeIcon({ class: cls }: { class?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={cls ?? "h-5 w-5"}
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}
function SettingsIcon({ class: cls }: { class?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={cls ?? "h-5 w-5"}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09A1.7 1.7 0 0 0 10.14 3V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.04 1.56.6.25 1.3.1 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09c.25.6.88 1.04 1.56 1.04H21a2 2 0 1 1 0 4h-.09c-.68 0-1.3.4-1.51 1.04Z" />
    </svg>
  );
}

// `pages/_nav.ts` owns the links; the icon components live here (a `.ts`
// module can't hold JSX). A page keyed to a missing icon fails the build
// here, not silently in the tab bar.
const ICONS = { home: HomeIcon, settings: SettingsIcon };

// One nav link with a clear active state: accent-ink text plus a small
// indicator. `vertical` renders the phone tab-bar item (icon over label);
// the default renders the header/sidebar row (icon beside label).
function NavLink({
  href,
  label,
  Icon,
  active,
  vertical,
}: {
  href: string;
  label: string;
  Icon: (props: { class?: string }) => View;
  active: boolean;
  vertical?: boolean;
}) {
  const base = vertical
    ? "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-xs font-medium"
    : "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium";
  const tone = active ? "text-ink" : "opacity-70 hover:opacity-100";
  const indicator = vertical ? (
    <span
      aria-hidden="true"
      class={`h-1 w-8 rounded-full transition-colors ${active ? "bg-primary" : "bg-transparent"}`}
    />
  ) : (
    <span
      aria-hidden="true"
      class={`w-1 self-stretch rounded-full transition-colors ${active ? "bg-primary" : "bg-transparent"}`}
    />
  );
  return (
    <Link href={href} aria-current={active ? "page" : undefined} class={`${base} ${tone} nav-link`}>
      {vertical ? null : indicator}
      <Icon />
      {label}
      {vertical ? indicator : null}
    </Link>
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
  // The router knows the current path on the server and the client, so the
  // nav highlights the open page after a full load and after client-side
  // navigation alike.
  const path = useRouter().path;
  return (
    // The accent is the primary color in both themes: daisyUI reads
    // `--color-primary` for every `btn-primary`, badge, checkbox, and
    // progress bar.
    <div
      class="accent-scope flex min-h-dvh flex-col lg:flex-row"
      style={`--color-primary:${appBrand.accent};--color-primary-content:${onAccent(appBrand.accent)}`}
    >
      {/* Phone + tablet header. Desktop keeps the brand in the sidebar. */}
      <header class="navbar bg-base-100 shadow-sm lg:hidden">
        <div class="mx-auto flex w-full max-w-2xl items-center justify-between px-4">
          <Link href="/" class="btn btn-ghost flex items-center gap-2 px-2 text-lg">
            <BrandMark />
            {appBrand.name}
          </Link>
          {/* Tablet widths have room for the links up top; phones get the
            bottom tab bar instead. */}
          <nav aria-label="Primary" class="hidden gap-1 sm:flex">
            {NAV.map(({ href, label, icon }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                Icon={ICONS[icon]}
                active={path === href}
              />
            ))}
          </nav>
        </div>
      </header>
      {/* Desktop sidebar: brand, nav, and the credit line at the bottom. */}
      <aside class="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-base-300 bg-base-100 p-6 lg:flex">
        <Link href="/" class="flex items-center gap-2 text-lg font-semibold">
          <BrandMark />
          {appBrand.name}
        </Link>
        <nav aria-label="Primary" class="flex flex-col gap-1">
          {NAV.map(({ href, label, icon }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              Icon={ICONS[icon]}
              active={path === href}
            />
          ))}
        </nav>
      </aside>
      <div class="flex min-w-0 flex-1 flex-col">
        {/* Bottom padding clears the fixed tab bar on phones: its own
          height plus the safe area plus the Free-badge strip. */}
        <main class="mx-auto w-full max-w-2xl grow px-4 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom)+var(--outer-badge-space,0px))] sm:pt-8 sm:pb-8">
          <ErrorBoundary fallback={ErrorFallback}>{children}</ErrorBoundary>
        </main>
        {/* No footer on phones (the tab bar owns the bottom edge) or on
          desktop (the sidebar frames the page): tablet only. */}
        <footer class="footer footer-center hidden bg-base-200 p-4 text-sm sm:grid lg:hidden">
          {/* daisyUI makes footer children grids; `block` keeps the line inline. */}
          <p class="block">
            © {new Date().getFullYear()} {appBrand.name}
          </p>
        </footer>
      </div>
      {/* Phone tab bar. Pinned to the very bottom of the screen; the inner
        padding holds the safe area plus the Free-badge space the proxy
        reserves (`--outer-badge-space`), so the badge sits in that strip
        below the tab items and covers nothing. Pro pages never set the
        variable, so it falls back to 0. Never cover or restyle
        `#outer-badge` — it is Outer's, not the app's. */}
      <nav
        aria-label="Primary"
        class="fixed inset-x-0 bottom-0 z-40 border-t border-base-300 bg-base-100/95 backdrop-blur sm:hidden"
      >
        <div
          class="mx-auto grid max-w-2xl gap-1 px-3 pt-1"
          style={`grid-template-columns:repeat(${NAV.length},minmax(0,1fr));padding-bottom:calc(env(safe-area-inset-bottom) + var(--outer-badge-space, 0px))`}
        >
          {NAV.map(({ href, label, icon }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              Icon={ICONS[icon]}
              active={path === href}
              vertical
            />
          ))}
        </div>
      </nav>
    </div>
  );
}
