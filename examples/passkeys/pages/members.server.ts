// The members page's server module. The loader is the gate: signed-out
// visitors get a redirect to `/sign-in`, so the page only renders for
// members. Copy this shape for any page that needs an account.
import { env } from "cloudflare:workers";
import { defineHandler, defineHead } from "void";

import { appBrand } from "./_brand.ts";
import { ensureAuthTables, getViewer } from "./_session.ts";

export interface Props {
  viewer: { handle: string; displayName: string };
}

export const loader = defineHandler(async (c): Promise<Props | Response> => {
  const db = await ensureAuthTables(env.DB);
  const viewer = await getViewer(db, c.req.header("cookie") ?? null);
  if (!viewer) {
    return c.redirect("/sign-in");
  }
  return { viewer: { handle: viewer.handle, displayName: viewer.displayName } };
});

export const head = defineHead(() => ({
  title: "Members",
  meta: [
    { name: "description", content: `Members of ${appBrand.name}.` },
    { property: "og:title", content: `Members | ${appBrand.name}` },
  ],
}));
