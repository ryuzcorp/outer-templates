import { env } from "cloudflare:workers";
import { defineHandler, defineHead } from "void";
import type { InferProps } from "void";

import { parseFilter, taskError } from "./_tasks.ts";
import type { Filter, Task } from "./_tasks.ts";
import { appBrand } from "./_brand.ts";

// D1 is the app's database. The table lives in `db/migrations/`
// (0001_tasks.sql creates it): dev-server startup and `void db migrate`
// apply it locally, and Outer applies the committed files on deploy before
// the new code goes live. The CREATE below stays as a backstop — `vite
// preview` runs no migrations, so a fresh local DB would otherwise miss the
// table. It matches the migrated schema, `IF NOT EXISTS`, so the two can
// never disagree. Nothing is kept in module scope: the app can sleep
// between requests, and only D1 survives.
async function database() {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS task (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0)",
  ).run();
  return env.DB;
}

interface Row {
  id: number;
  text: string;
  done: number;
}

export interface Props {
  items: Task[];
  filter: Filter;
  counts: { all: number; active: number; done: number };
}

export const loader = defineHandler(async (c): Promise<Props> => {
  const filter = parseFilter(c.req.query("filter"));
  const db = await database();
  const where = filter === "all" ? "" : filter === "active" ? "WHERE done = 0" : "WHERE done = 1";
  const [{ results }, totals] = await Promise.all([
    db.prepare(`SELECT id, text, done FROM task ${where} ORDER BY id`).all<Row>(),
    db
      .prepare("SELECT done, COUNT(*) AS n FROM task GROUP BY done")
      .all<{ done: number; n: number }>(),
  ]);
  let active = 0;
  let done = 0;
  for (const row of totals.results ?? []) {
    if (row.done) {
      done += row.n;
    } else {
      active += row.n;
    }
  }
  return {
    items: (results ?? []).map((row) => ({ id: row.id, text: row.text, done: row.done === 1 })),
    filter,
    counts: { all: active + done, active, done },
  };
});

export const head = defineHead(() => ({
  title: "Tasks",
  meta: [
    { name: "description", content: appBrand.description },
    { property: "og:title", content: `Tasks | ${appBrand.name}` },
    { property: "og:description", content: appBrand.description },
  ],
}));

// One action per page; `intent` says which form sent it.
export const action = defineHandler(async (c) => {
  const body = await c.req.json<{ intent?: string; text?: string; id?: number }>();
  const db = await database();
  if (body.intent === "add") {
    const message = taskError(body.text ?? "");
    if (message) {
      return c.json({ errors: { text: message } }, 422);
    }
    await db
      .prepare("INSERT INTO task (text) VALUES (?)")
      .bind((body.text ?? "").trim())
      .run();
  } else if (body.intent === "toggle" && Number.isInteger(body.id)) {
    await db.prepare("UPDATE task SET done = 1 - done WHERE id = ?").bind(body.id).run();
  } else if (body.intent === "edit" && Number.isInteger(body.id)) {
    const message = taskError(body.text ?? "");
    if (message) {
      return c.json({ errors: { text: message } }, 422);
    }
    await db
      .prepare("UPDATE task SET text = ? WHERE id = ?")
      .bind((body.text ?? "").trim(), body.id)
      .run();
  } else if (body.intent === "remove" && Number.isInteger(body.id)) {
    await db.prepare("DELETE FROM task WHERE id = ?").bind(body.id).run();
  }
  // Return nothing: Void re-runs the loader and answers with the page JSON
  // (`X-VoidPages`), which the client applies in place. Returning data here
  // would bypass the pages protocol and force a full-page reload.
});

export type PageProps = InferProps<typeof loader>;
