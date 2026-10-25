import { expect, test } from "bun:test";

import { renderHtml } from "ilha/test";

import NewsletterForm from "./islands/NewsletterForm.tsx";
import { newsletterError } from "./lib/newsletter.ts";

test("blank and malformed emails are refused with a message", () => {
  expect(newsletterError("")).toBe("Write your email first.");
  expect(newsletterError("not-an-email")).toBe("That email doesn't look right.");
});

test("a well-formed email passes", () => {
  expect(newsletterError("you@example.com")).toBeNull();
});

test("the signup form renders its controls", async () => {
  const html = await renderHtml(() => <NewsletterForm />, { markers: false, snapshot: false });
  expect(html).toContain('placeholder="you@example.com"');
  expect(html).toContain("Subscribe");
});
