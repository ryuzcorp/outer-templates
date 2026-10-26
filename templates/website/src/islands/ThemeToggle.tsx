import { atom, watch } from "ilha";

import { readStoredTheme, resolveTheme, writeStoredTheme } from "../lib/theme.ts";

// `window.localStorage` itself can throw (storage blocked by browser
// policy), before the guarded read/write helpers run. Without storage the
// theme still applies; it just isn't remembered.
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      class="h-5 w-5"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-5 w-5"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

// A theme toggle island: reads the saved theme after mount (never during
// server render — `localStorage` doesn't exist there) and flips the
// daisyUI theme between `light` and `dark`. An icon, not a word: the
// `aria-label` names the action for assistive tech.
export default function ThemeToggle() {
  const theme = atom("light");
  const mounted = atom(false);
  watch.once(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    mounted.set(true);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const effective = resolveTheme(readStoredTheme(storage()), prefersDark);
    theme.set(effective);
    document.documentElement.dataset.theme = effective;
  });

  function toggle() {
    const next = theme() === "light" ? "dark" : "light";
    theme.set(next);
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      document.documentElement.dataset.theme = next;
      writeStoredTheme(storage(), next);
    }
  }

  const dark = theme() === "dark";
  return (
    <button
      type="button"
      onclick={toggle}
      disabled={!mounted()}
      class="btn btn-ghost btn-square min-h-11 min-w-11"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
