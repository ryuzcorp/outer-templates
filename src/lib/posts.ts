// The blog builds every post path from the collection entry id: the glob
// loader's entries carry `id` (e.g. "hello.md"), not `slug`, so the index
// and the `[slug]` route must derive the same path from the same id.
export function postSlug(id: string): string {
  return id.replace(/\.md$/, "");
}
