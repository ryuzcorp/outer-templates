import { expect, test } from "bun:test";

import { renderHtml } from "ilha/test";

import { MAX_TEXT, parseFilter, taskError } from "./_tasks.ts";
import type { Props } from "./tasks.server.ts";
import Tasks from "./tasks.tsx";

const empty: Props = { items: [], filter: "all", counts: { all: 0, active: 0, done: 0 } };

test("renders the form controls disabled until the client mounts", async () => {
  // The form is server-rendered in place; its controls stay disabled until
  // hydration attaches the submit handler, so an early fill or click waits
  // instead of falling back to a native GET submit.
  const html = await renderHtml(() => <Tasks {...empty} />, {
    markers: false,
    snapshot: false,
  });
  expect(html).toContain("<fieldset disabled");
});

test("each filter has its own empty state", async () => {
  for (const [filter, message] of [
    ["all", "A fresh list"],
    ["active", "Nothing left to do."],
    ["done", "Nothing completed yet."],
  ] as const) {
    const html = await renderHtml(() => <Tasks {...empty} filter={filter} />, {
      markers: false,
      snapshot: false,
    });
    expect(html).toContain(message);
    expect(html).toContain('aria-current="page"');
  }
});

test("the empty list offers starter suggestions", async () => {
  const html = await renderHtml(() => <Tasks {...empty} />, { markers: false, snapshot: false });
  expect(html).toContain("Buy milk");
  expect(html).toContain("Water the plants");
});

test("the progress pill celebrates only a finished non-empty list", async () => {
  const none = await renderHtml(() => <Tasks {...empty} />, { markers: false, snapshot: false });
  expect(none).not.toContain("All done");
  expect(none).not.toContain("of 0 done");

  const partial: Props = {
    items: [{ id: 1, text: "Buy milk", done: false }],
    filter: "all",
    counts: { all: 2, active: 1, done: 1 },
  };
  const some = await renderHtml(() => <Tasks {...partial} />, { markers: false, snapshot: false });
  expect(some).toContain("1 of 2 done");
  expect(some).not.toContain("All done");

  const finished: Props = {
    items: [{ id: 1, text: "Buy milk", done: true }],
    filter: "all",
    counts: { all: 1, active: 0, done: 1 },
  };
  const all = await renderHtml(() => <Tasks {...finished} />, { markers: false, snapshot: false });
  expect(all).toContain("All done");
});

test("blank and overlong text is refused with a message", () => {
  expect(taskError("")).toBe("Write something first.");
  expect(taskError("   ")).toBe("Write something first.");
  expect(taskError("x".repeat(MAX_TEXT + 1))).toBe(`Keep it under ${MAX_TEXT} characters.`);
});

test("text at the limit passes", () => {
  expect(taskError("x".repeat(MAX_TEXT))).toBeNull();
  expect(taskError("  buy milk  ")).toBeNull();
});

test("unknown filters fall back to all", () => {
  expect(parseFilter("active")).toBe("active");
  expect(parseFilter("done")).toBe("done");
  expect(parseFilter("archived")).toBe("all");
  expect(parseFilter(undefined)).toBe("all");
});

test("done items render checked with a line-through", async () => {
  const props: Props = {
    items: [
      { id: 1, text: "Buy milk", done: false },
      { id: 2, text: "Paid rent", done: true },
    ],
    filter: "all",
    counts: { all: 2, active: 1, done: 1 },
  };
  const html = await renderHtml(() => <Tasks {...props} />, { markers: false, snapshot: false });
  expect(html).toContain("Buy milk");
  expect(html).toContain("Paid rent");
  expect(html).toContain("line-through");
  expect(html).toContain("1 of 2 done");
  expect(html).toContain('aria-label="Mark Paid rent as not done"');
});
