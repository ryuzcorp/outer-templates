// Shared with the theme toggle island and its test: one rule, one place.
// Keep it plain (no JSX, no atoms) so the island and `bun test` can both
// import it.
export type Theme = "light" | "dark";

// The effective theme: a saved "light"/"dark" wins; otherwise the OS
// preference decides. The toggle starts from this (not from a hardcoded
// "light") so its first click always switches — with no saved theme on a
// dark-mode OS, daisyUI already renders dark.
export function resolveTheme(saved: unknown, prefersDark: boolean): Theme {
  if (saved === "light" || saved === "dark") {
    return saved;
  }
  return prefersDark ? "dark" : "light";
}

// Storage throws when access is blocked (private mode, denied cookies):
// read degrades to null (fall back to the OS preference), writes degrade
// to a no-op — the document theme still applies either way.
export function readStoredTheme(storage: Pick<Storage, "getItem"> | null): Theme | null {
  if (!storage) {
    return null;
  }
  try {
    const saved = storage.getItem("theme");
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

export function writeStoredTheme(storage: Pick<Storage, "setItem"> | null, theme: Theme): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem("theme", theme);
  } catch {
    // Persistence unavailable; the document theme still applies.
  }
}
