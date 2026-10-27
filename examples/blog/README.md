# Blog example

Add a journal to your site: a `/blog` index (newest first, with reading
times), one static page per post, two sample posts, and sitemap entries.
Your RSS feed needs no changes — it lists every non-draft post on its own.

## What you get

- `src/content/posts/*.md` — two sample posts for you to rewrite.
- `src/pages/blog/index.astro` — the index, with an empty state.
- `src/pages/blog/[...slug].astro` — one page per post.
- `src/lib/posts.ts` — slug + reading-time helpers (overwrites the shell file).
- `src/lib/posts.test.ts` — tests for the reading-time helper.
- `src/pages/sitemap.xml.ts` — sitemap with `/blog` and every post (overwrites the shell file).
- `src/styles/article.css` — readable Markdown styling for post pages.

## Steps

1. Call `examples blog` to get the files, then copy every file onto the
   same path in your site in one `commit` (or `stage` them).
2. Overwrite `src/lib/posts.ts` and `src/pages/sitemap.xml.ts` — the shell
   versions are stubs that say so at the top of each file.
3. Add a `/blog` link next to the `links` array in `src/layouts/Base.astro`
   so visitors can reach the journal from the header and footer.
4. Rewrite the two sample posts (or delete them and write your own with the
   same frontmatter: `title`, `description`, `date`).
5. Run `check` before shipping (`stage` → `check` → `ship`, or one
   `commit`), then verify with `look_at_app`: open `/blog` on a phone
   and a desktop to confirm both layouts.

## Gotchas

- Frontmatter needs all three fields; a missing `date` fails the build.
- Slugs come from filenames (`hello.md` → `/blog/hello`), so use lowercase
  names with dashes and never rename a published file.
- `draft: true` in frontmatter hides a post from the index, feed, sitemap,
  and its own URL (the slug route returns 404).
- Reading time counts prose at 200 words per minute, skips code blocks, and
  never shows less than one minute.
- New pages go in `sitemap.xml.ts` next to `/` and `/blog`.
- With zero posts the index shows "No posts yet" instead of failing — keep
  that state until you publish your first post.
