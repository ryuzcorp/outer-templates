# Blog example

Add a journal to your site: a `/blog` index (newest first, with reading
times), one static page per post, two sample posts, and sitemap entries.
Your RSS feed needs no changes — it lists every non-draft post on its own.

## What `add_example` does

In one commit: copies `src/content/posts/*.md` (two sample posts),
`src/pages/blog/index.astro` (the index, with an empty state),
`src/pages/blog/[...slug].astro` (one page per post), `src/lib/blog.ts`
(reading-time helpers) and `src/lib/blog.test.ts`, and
`src/styles/article.css` (readable Markdown styling for post pages).
The shell's feed and sitemap pick up the posts on their own, and `/blog`
renders as soon as it is applied — no further wiring.

## Customise

- Rewrite the two sample posts (or delete them and write your own with
  the same frontmatter: `title`, `description`, `date`).
- Add a `/blog` link next to the `links` array in
  `src/layouts/Base.astro` so visitors reach the journal from the header
  and footer.
- New pages go in `src/pages/sitemap.xml.ts` next to `/` and `/blog`.

## Without `add_example`

Call `examples blog` to get the files, then in one commit: copy every
file onto the same path. Then `check`, `ship`, and `look_at_app`: open
`/blog` on a phone and a desktop to confirm both layouts.

## Gotchas

- Frontmatter needs all three fields; a missing `date` fails the build.
- Slugs come from filenames (`hello.md` → `/blog/hello`), so use lowercase
  names with dashes and never rename a published file.
- `draft: true` in frontmatter hides a post from the index, feed, sitemap,
  and its own URL (the slug route returns 404).
- Reading time counts prose at 200 words per minute, skips code blocks, and
  never shows less than one minute.
- With zero posts the index shows "No posts yet" instead of failing — keep
  that state until you publish your first post.
