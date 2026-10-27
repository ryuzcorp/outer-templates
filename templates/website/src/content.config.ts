import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// One Markdown file per post in `src/content/posts/` (the `blog` example
// adds the first ones). Drafts never build.
const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
