// Post slugs for the feed and sitemap: the glob loader's entries carry
// `id` (e.g. "hello.md"), not `slug`, so both derive the path from the id.
// The `blog` example adds the first posts (plus reading times in its own
// `src/lib/blog.ts`); until then the index, feed, and sitemap render empty.
export function postSlug(id: string): string {
  return id.replace(/\.md$/, "");
}
