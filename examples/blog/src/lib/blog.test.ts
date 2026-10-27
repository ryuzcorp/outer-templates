import { expect, test } from "bun:test";

import { readingTime, WORDS_PER_MINUTE } from "./blog.ts";

test("short posts still read as one minute", () => {
  expect(readingTime("Hello, website.")).toBe(1);
  expect(readingTime("")).toBe(1);
});

test("reading time scales with prose, not code", () => {
  const prose = Array(WORDS_PER_MINUTE + 1)
    .fill("word")
    .join(" ");
  expect(readingTime(prose)).toBe(2);
  const code = `\`\`\`\n${prose}\n\`\`\`\nDone.`;
  expect(readingTime(code)).toBe(1);
});
