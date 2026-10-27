import type { APIRoute } from "astro";

import { siteUrl } from "../lib/site.ts";

// Every public page, prerendered at build time. New pages go in this list
// next to `/` (the `blog` example ships its own sitemap with the journal
// and every post).
export const GET: APIRoute = async () => {
  const origin = siteUrl();
  const paths = ["/"];
  const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
