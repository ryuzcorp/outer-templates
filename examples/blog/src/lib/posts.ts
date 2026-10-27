// The blog builds every post path from the collection entry id: the glob
// loader's entries carry `id` (e.g. "hello.md"), not `slug`, so the index
// and the `[...slug]` route must derive the same path from the same id.
export function postSlug(id: string): string {
  return id.replace(/\.md$/, "");
}
// Minutes to read a post, from its raw Markdown. Code blocks don't count
// (skimmed, not read), and at least one minute always shows.
export const WORDS_PER_MINUTE = 200;

export function readingTime(markdown: string): number {
  const prose = markdown.replace(/```[\s\S]*?```/g, " ");
  const words = prose
    .replace(/[#>*`[\]()!|-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
