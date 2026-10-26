---
title: "Hello, website"
description: "Your first post: edit Markdown, rebuild, done."
date: 2026-10-20
---

This is a sample post. Write yours in Markdown under `src/content/posts/` —
each file becomes a page at `/blog/<filename>`. Frontmatter needs `title`,
`description`, and `date`; set `draft: true` while a post is unfinished and
it stays out of the build.

- Mostly static pages stay prerendered: no server runs for them.
- Need a form or live data? Add an island (see the homepage) or a server
  route with `export const prerender = false` (see `/api/newsletter`).
