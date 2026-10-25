import type { APIRoute } from "astro";

import { newsletterError } from "../../lib/newsletter.ts";

// A server route: it opts out of prerendering, so it runs in the Worker and
// sees bindings via `locals.runtime.env`. The homepage island POSTs here;
// the table lives in `db/migrations/0001_newsletter.sql` (Outer applies
// committed migrations on deploy before the new code goes live). The CREATE
// below stays as a backstop — local dev without migrations would otherwise
// miss the table. Same statement as the migration, `IF NOT EXISTS`, so the
// two can never disagree.
export const prerender = false;

async function database(env: { DB: D1Database }) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS newsletter (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE)",
  ).run();
  return env.DB;
}

export const POST: APIRoute = async ({ locals, request }) => {
  const { DB } = locals.runtime.env;
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const message = newsletterError(body?.email ?? "");
  if (message) {
    return Response.json({ message }, { status: 422 });
  }
  const email = (body?.email ?? "").trim();
  const db = await database({ DB });
  try {
    await db.prepare("INSERT INTO newsletter (email) VALUES (?)").bind(email).run();
  } catch {
    // UNIQUE(email): an address already on the list is still a success to
    // the caller — confirming a subscription must not leak who signed up.
    return Response.json({ ok: true });
  }
  return Response.json({ ok: true });
};
