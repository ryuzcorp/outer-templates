// Reading time for journal posts, from raw Markdown. Code blocks don't
// count (skimmed, not read), and at least one minute always shows. Slugs
// live in the shell's `src/lib/posts.ts`, shared with the feed and sitemap.
export const WORDS_PER_MINUTE = 200;

export function readingTime(markdown: string): number {
  const prose = markdown.replace(/```[\s\S]*?```/g, " ");
  const words = prose
    .replace(/[#>*`[\]()!|-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
