import { expect, test } from "bun:test";

import { renderHtml } from "ilha/test";

import { NAV } from "./_nav.ts";
import Layout from "./layout.tsx";

// The header, sidebar, and phone tab bar render the same NAV as siblings,
// so bare `href` keys warn ILHA005 on every page. The keys are prefixed per
// list (`header:`, `sidebar:`, `tab:`); this render must stay warning-free.
test("the layout renders every nav list with unique keys", async () => {
  const warns: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warns.push(String(args[0]));
  };
  try {
    const html = await renderHtml(
      () => (
        <Layout>
          <p>page</p>
        </Layout>
      ),
      { markers: false, snapshot: false },
    );
    for (const { href } of NAV) {
      expect(html).toContain(`href="${href}"`);
    }
  } finally {
    console.warn = origWarn;
  }
  expect(warns.filter((w) => w.includes("ILHA005"))).toEqual([]);
});
