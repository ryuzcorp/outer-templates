import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";

import { postSlug } from "../lib/posts.ts";
import { siteUrl } from "../lib/site.ts";

type Post = CollectionEntry<"posts">;

// Every public page, prerendered at build time. Drafts stay out; the feed
// and API routes aren't pages and stay out too. Slugs come from Markdown
// filenames, which never contain XML-significant characters.
export const GET: APIRoute = async () => {
  const origin = siteUrl();
  const posts = await getCollection("posts", ({ data }: Post) => !data.draft);
  const paths = [
    "/",
    "/blog",
    "/about",
    ...posts.map((post: Post) => `/blog/${postSlug(post.id)}`),
  ];
  const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
