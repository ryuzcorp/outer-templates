// Brand icon generator. Reads brand.json and writes public/favicon.svg: a
// rounded square in the brand accent with the brand initials on top.
// Runs at config load (vite.config.ts) and in dev, so the committed static
// favicon is gone — never commit the generated file or icon PNGs.
// Usage: node scripts/brand.mjs [brand.json path] [favicon.svg path]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
function channel(hex, from, to) {
  return parseInt(hex.slice(from, to), 16) / 255;
}

// Relative luminance, WCAG 2.1 §1.4.3. Returned text color is whichever of
// black/white has the higher contrast ratio against the accent.
export function onAccent(accent) {
  const r = channel(accent, 1, 3);
  const g = channel(accent, 3, 5);
  const b = channel(accent, 5, 7);
  const linear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  const white = 1.05 / (luminance + 0.05);
  const black = (luminance + 0.05) / 0.05;
  return white >= black ? "#ffffff" : "#000000";
}

// First letter, or the first two initials ("Pizza Calculator" → "PC").
export function initials(name) {
  const words = name
    .split(/[\s_-]+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const marks = (words.length > 1 ? words.slice(0, 2) : words.slice(0, 1)).map(
    (word) => [...word][0] ?? "",
  );
  return marks.join("").toUpperCase() || "?";
}

function escapeXml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function faviconSvg(brand) {
  const fg = onAccent(brand.accent);
  const size = brand.shortName.length > 2 ? 200 : 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${escapeXml(brand.accent)}"/><text x="256" y="256" dy="0.36em" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="${size}" fill="${fg}">${escapeXml(initials(brand.name))}</text></svg>\n`;
}

// Importing this module (vite.config.ts does) must not run the CLI: under
// `vite build`, `process.argv[2]` is the `build` subcommand, not a path.
const invokedAsScript =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = process.argv[2] ?? path.join(here, "..", "brand.json");
  const out = process.argv[3] ?? path.join(here, "..", "public", "favicon.svg");
  const brand = JSON.parse(readFileSync(root, "utf8"));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, faviconSvg(brand));
}
