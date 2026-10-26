import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";

import { siteBrand } from "../lib/brand.ts";
import { postSlug } from "../lib/posts.ts";
import { siteUrl } from "../lib/site.ts";

type Post = CollectionEntry<"posts">;

function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// The blog feed, prerendered at build time. Skips drafts like the index.
// Feed links are absolute (see `src/lib/site.ts` for the origin).
export const GET: APIRoute = async () => {
  const origin = siteUrl();
  const posts = (await getCollection("posts", ({ data }: Post) => !data.draft)).sort(
    (a: Post, b: Post) => b.data.date.getTime() - a.data.date.getTime(),
  );
  const items = posts
    .map(
      (post: Post) => `    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${origin}/blog/${postSlug(post.id)}</link>
      <guid>${origin}/blog/${postSlug(post.id)}</guid>
      <pubDate>${post.data.date.toUTCString()}</pubDate>
      <description>${escapeXml(post.data.description)}</description>
    </item>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(siteBrand.name)} blog</title>
    <link>${origin}/blog</link>
    <description>${escapeXml(siteBrand.description)}</description>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
};
