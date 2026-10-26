// The brand in one place: `brand.json` (repo root) names the site, and
// every head tag, the header, and the footer render from it. Edit
// brand.json to rebrand — never the generated outputs.
import brand from "../../brand.json";

export interface Brand {
  name: string;
  shortName: string;
  description: string;
  accent: string;
}

export const siteBrand: Brand = brand;

// Page titles compose here: the home page is the bare name, everything else
// appends it (`Blog | Outer Site`).
export function pageTitle(page?: string): string {
  return page ? `${page} | ${brand.name}` : brand.name;
}

// First letter, or the first two initials ("Pizza Calculator" → "PC").
// Mirrors scripts/brand.mjs, which draws the same mark into the favicon.
export function initials(name: string): string {
  const words = name
    .split(/[\s_-]+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const marks = (words.length > 1 ? words.slice(0, 2) : words.slice(0, 1)).map(
    (word) => [...word][0] ?? "",
  );
  return marks.join("").toUpperCase() || "?";
}

// Black or white text on the accent, whichever contrasts more (WCAG 2.1).
// Mirrors scripts/brand.mjs so the header mark matches the favicon.
export function onAccent(accent: string): string {
  const channel = (from: number, to: number) => parseInt(accent.slice(from, to), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance =
    0.2126 * linear(channel(1, 3)) +
    0.7152 * linear(channel(3, 5)) +
    0.0722 * linear(channel(5, 7));
  const white = 1.05 / (luminance + 0.05);
  const black = (luminance + 0.05) / 0.05;
  return white >= black ? "#ffffff" : "#000000";
}
