# Landing example

Build your home page from five copyable sections: an accent-wash hero, a
services grid, a testimonial, an FAQ, and a contact call-to-action. The CTA
is a link, not a signup form — the form lives in the newsletter example.
A `/landing` page composing all five ships with the example, so the result
renders as soon as it is applied.

## What `add_example` does

In one commit: copies the five section components
(`src/components/landing/*.astro`) and `src/pages/landing.astro` (the
example page composing them).

## Customise

- Rewrite every word: the services, the FAQ answers, and the hero headline
  are the previous site's copy, not yours.
- Point the Hero buttons (`/blog`, `/about`) and the Cta link (`/contact`)
  at pages you actually have — or create those pages first.
- Make it the home page: move the composition into
  `src/pages/index.astro`, replacing the shell's "nothing here yet" page.

## Without `add_example`

Call `examples landing` to get the files, then in one commit: copy the
five files onto the same paths, plus `src/pages/landing.astro`, or compose
them in `src/pages/index.astro` directly with this snippet:
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
Then `check`, `ship`, and `look_at_app`: read the whole page on a phone —
buttons need 44px targets and no horizontal scroll.

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
