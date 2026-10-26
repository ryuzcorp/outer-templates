import { defineMiddleware } from "void";

import { appBrand, initials, onAccent } from "../pages/_brand.ts";

// Unknown URLs land here: Void's pages fallback answers 404, and this
// middleware swaps the default body for a branded page. A middleware —
// not a `[...path]` catch-all page — because the catch-all would also
// claim the dev component sources (`/pages/*.tsx`) and break hydration.
// Only document navigations are rewritten (last segment without a dot,
// accepting HTML): API calls, assets, and the page-JSON protocol keep
// Void's default answers byte-identical.
function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function notFoundDocument(): string {
  const fg = onAccent(appBrand.accent);
  const mark = initials(appBrand.name);
  const name = escapeHtml(appBrand.name);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="${escapeHtml(appBrand.accent)}" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<title>Not found | ${name}</title>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f3f4f6;color:#111">
<header style="background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08);padding:12px 16px;display:flex;align-items:center;gap:8px;font-size:18px;font-weight:600">
<span aria-hidden="true" style="display:inline-flex;width:36px;height:36px;align-items:center;justify-content:center;border-radius:8px;font-size:16px;font-weight:700;background:${escapeHtml(appBrand.accent)};color:${fg}">${escapeHtml(mark)}</span>${name}</header>
<main style="max-width:512px;margin:0 auto;padding:32px 16px 112px">
<div style="background:#fff;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.08);padding:48px 24px;text-align:center">
<h1 style="margin:0 0 8px;font-size:24px">Page not found</h1>
<p style="margin:0 0 24px;opacity:.7">The link may be old, or the page may have moved.</p>
<a href="/" style="display:inline-block;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;background:${escapeHtml(appBrand.accent)};color:${fg}">Back to the checklist</a>
</div>
</main>
</body>
</html>
`;
}

export default defineMiddleware(async (c, next) => {
  await next();
  if (c.res.status !== 404) {
    return;
  }
  if (!(c.req.header("accept") ?? "").includes("text/html")) {
    return;
  }
  const path = new URL(c.req.url).pathname;
  if (
    path.startsWith("/assets/") ||
    path.startsWith("/@id/") ||
    path.startsWith("/__void") ||
    path.startsWith("/__debug")
  ) {
    return;
  }
  if (path.slice(path.lastIndexOf("/") + 1).includes(".")) {
    return;
  }
  c.res = new Response(notFoundDocument(), {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
