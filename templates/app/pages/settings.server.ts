import { defineHead } from "void";

import { appBrand } from "./_brand.ts";

export const head = defineHead(() => ({
  title: "Settings",
  meta: [
    { name: "description", content: `Settings for ${appBrand.name}.` },
    { property: "og:title", content: `Settings | ${appBrand.name}` },
  ],
}));
