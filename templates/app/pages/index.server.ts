// The home page's server module. The shell home page is static, so this
// file only sets the document head from `brand.json`. Pages with data add
// a `loader` (and an `action` for forms) here — see the `list-form`
// example for the full shape.
import { defineHead } from "void";

import { appBrand } from "./_brand.ts";

export const head = defineHead(() => ({
  // The brand name is already the template suffix (`%s | ${appBrand.name}`
  // in void.config.ts), so the home page takes the plain name "Home".
  title: "Home",
  meta: [
    { name: "description", content: appBrand.description },
    { property: "og:title", content: appBrand.name },
    { property: "og:description", content: appBrand.description },
  ],
}));
