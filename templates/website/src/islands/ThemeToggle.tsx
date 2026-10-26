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

// A theme toggle island: reads the saved theme after mount (never during
// server render — `localStorage` doesn't exist there) and flips the
// daisyUI theme between `light` and `dark`.
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

  return (
    <button
      type="button"
      onclick={toggle}
      disabled={!mounted()}
      class="btn btn-ghost btn-sm"
      aria-label={`Switch to ${theme() === "light" ? "dark" : "light"} theme`}
    >
      {theme() === "light" ? "Dark" : "Light"}
    </button>
  );
}
