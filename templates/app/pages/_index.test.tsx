import { expect, test } from "bun:test";

import { renderHtml } from "ilha/test";

import { initials, onAccent } from "./_brand.ts";
import { checklistError, MAX_TEXT, parseFilter } from "./_checklist.ts";
import { initials as scriptInitials, onAccent as scriptOnAccent } from "../scripts/brand.mjs";
import type { Props } from "./index.server.ts";
import Home from "./index.tsx";

const empty: Props = { items: [], filter: "all", counts: { all: 0, active: 0, done: 0 } };

test("renders the form controls disabled until the client mounts", async () => {
  // The form is server-rendered in place; its controls stay disabled until
  // hydration attaches the submit handler, so an early fill or click waits
  // instead of falling back to a native GET submit.
  const html = await renderHtml(() => <Home {...empty} />, {
    markers: false,
    snapshot: false,
  });
  expect(html).toContain("<fieldset disabled");
});

test("each filter has its own empty state", async () => {
  for (const [filter, message] of [
    ["all", "Add the first item below."],
    ["active", "Nothing left to do."],
    ["done", "Nothing completed yet."],
  ] as const) {
    const html = await renderHtml(() => <Home {...empty} filter={filter} />, {
      markers: false,
      snapshot: false,
    });
    expect(html).toContain(message);
    expect(html).toContain('aria-current="page"');
  }
});

test("blank and overlong text is refused with a message", () => {
  expect(checklistError("")).toBe("Write something first.");
  expect(checklistError("   ")).toBe("Write something first.");
  expect(checklistError("x".repeat(MAX_TEXT + 1))).toBe(`Keep it under ${MAX_TEXT} characters.`);
});

test("text at the limit passes", () => {
  expect(checklistError("x".repeat(MAX_TEXT))).toBeNull();
  expect(checklistError("  buy milk  ")).toBeNull();
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
  const html = await renderHtml(() => <Home {...props} />, { markers: false, snapshot: false });
  expect(html).toContain("Buy milk");
  expect(html).toContain("Paid rent");
  expect(html).toContain("line-through");
  expect(html).toContain("1 left");
  expect(html).toContain('aria-label="Mark Paid rent as not done"');
});

test("brand initials take the first letter or two", () => {
  expect(initials("Pizza Calculator")).toBe("PC");
  expect(initials("Pizza")).toBe("P");
  expect(initials("Outer App")).toBe("OA");
});

test("white text wins on dark accents, black on light ones", () => {
  expect(onAccent("#000000")).toBe("#ffffff");
  expect(onAccent("#ffffff")).toBe("#000000");
  expect(onAccent("#4338ca")).toBe("#ffffff");
  expect(onAccent("#d9482b")).toBe("#000000");
});

test("the runtime brand helpers match the icon script", () => {
  for (const name of ["Outer App", "Pizza Calculator", "Kalkulator Pizzy", "A"]) {
    expect(initials(name)).toBe(scriptInitials(name));
  }
  for (const accent of ["#4338ca", "#d9482b", "#ffffff", "#000000", "#f5c518"]) {
    expect(onAccent(accent)).toBe(scriptOnAccent(accent));
  }
});
