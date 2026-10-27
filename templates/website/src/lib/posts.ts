// Post slugs for the feed and sitemap: the glob loader's entries carry
// `id` (e.g. "hello.md"), not `slug`, so both derive the path from the id.
// The `blog` example replaces this file with the full version (slugs plus
// reading time) when the site grows a journal.
export function postSlug(id: string): string {
  return id.replace(/\.md$/, "");
}
