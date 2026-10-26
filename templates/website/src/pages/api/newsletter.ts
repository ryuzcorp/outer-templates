import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { isUniqueViolation, newsletterRequest } from "../../lib/newsletter.ts";

// A server route: it opts out of prerendering, so it runs in the Worker and
// reads bindings from `cloudflare:workers`. The homepage island POSTs here;
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

export const POST: APIRoute = async ({ request }) => {
  const { DB } = env;
  const body: unknown = await request.json().catch(() => null);
  const parsed = newsletterRequest(body);
  if ("message" in parsed) {
    return Response.json({ message: parsed.message }, { status: 422 });
  }
  const db = await database({ DB });
  try {
    await db.prepare("INSERT INTO newsletter (email) VALUES (?)").bind(parsed.email).run();
  } catch (error) {
    // UNIQUE(email): an address already on the list is still a success to
    // the caller — confirming a subscription must not leak who signed up.
    // Anything else (write limits, lost connections, overload) failed to
    // save, so it answers 500 instead of a false "You're on the list."
    if (!isUniqueViolation(error)) {
      return Response.json({ message: "Couldn't save that email. Try again." }, { status: 500 });
    }
  }
  return Response.json({ ok: true });
};
