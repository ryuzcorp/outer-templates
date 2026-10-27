# Landing example

Build your home page from five copyable sections: an accent-wash hero, a
services grid, a testimonial, an FAQ, and a contact call-to-action. The CTA
is a link, not a signup form — the form lives in the newsletter example.

## What you get

- `src/components/landing/Hero.astro` — headline, brand line, two buttons.
- `src/components/landing/Features.astro` — three-card services grid.
- `src/components/landing/Testimonial.astro` — one quote (placeholder).
- `src/components/landing/Faq.astro` — three collapsible questions.
- `src/components/landing/Cta.astro` — contact call-to-action with a link.

## Steps

1. Copy the five files onto the same paths in your site.
2. Compose them in `src/pages/index.astro`, replacing the shell's
   "nothing here yet" page, with this snippet:
   ```astro
   ---
   import Base from "../layouts/Base.astro";
   import Hero from "../components/landing/Hero.astro";
   import Features from "../components/landing/Features.astro";
   import Testimonial from "../components/landing/Testimonial.astro";
   import Faq from "../components/landing/Faq.astro";
   import Cta from "../components/landing/Cta.astro";
   import { pageTitle, siteBrand } from "../lib/brand.ts";
   ---

   <Base title={pageTitle()} description={siteBrand.description}>
     <div class="flex flex-col gap-10 sm:gap-14">
       <Hero />
       <Features />
       <Testimonial />
       <Faq />
       <Cta />
     </div>
   </Base>
   ```
3. Rewrite every word: the services, the FAQ answers, and the hero headline
   are the previous site's copy, not yours.
4. Point the Hero buttons (`/blog`, `/about`) and the Cta link (`/contact`)
   at pages you actually have — or create those pages first.
5. Run `bun run check` and `bun run build`, then read the whole page on a
   phone: buttons need 44px targets and no horizontal scroll.

## Gotchas

- The testimonial is a placeholder (`Placeholder Client — founder, Example
  Company`): replace the quote and the name before launch, never ship it.
- The Cta links to `/contact`, which does not exist yet — point `contactHref`
  at a real page, or swap this section for the newsletter example's form.
- The FAQ answers assume the Cta sits right below them; keep that order or
  reword the "contact section below" and "follow along" answers.
- `text-ink` needs the shell's theme CSS; if you recolored the theme, check
  the eyebrow and icon contrast in both light and dark mode.
- Section order matters on phones: hero, proof, answers, contact — do not
  bury the Cta above the FAQ where nobody finishes reading.
