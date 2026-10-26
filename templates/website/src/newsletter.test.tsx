import { expect, test } from "bun:test";

import { renderHtml } from "ilha/test";

import NewsletterForm from "./islands/NewsletterForm.tsx";
import {
  isUniqueViolation,
  newsletterError,
  newsletterRequest,
  postSubscription,
} from "./lib/newsletter.ts";
import { postSlug } from "./lib/posts.ts";
import { readStoredTheme, resolveTheme, writeStoredTheme } from "./lib/theme.ts";

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

test("non-string email values normalize to a 422 message, never a throw", () => {
  for (const body of [{ email: 42 }, { email: ["a@b.c"] }, { email: {} }, {}, null, undefined]) {
    const parsed = newsletterRequest(body);
    expect("message" in parsed).toBe(true);
  }
  expect(newsletterRequest({ email: "  you@example.com " })).toEqual({ email: "you@example.com" });
});

test("only a UNIQUE violation reads as already-subscribed", () => {
  expect(isUniqueViolation(new Error("UNIQUE constraint failed: newsletter.email"))).toBe(true);
  expect(isUniqueViolation(new Error("D1_ERROR: too many writes"))).toBe(false);
  expect(isUniqueViolation("connection reset")).toBe(false);
});

test("a rejected signup request surfaces a failure message", async () => {
  const offline = () => Promise.reject(new Error("offline"));
  expect(await postSubscription("you@example.com", offline)).toBe(
    "Couldn't save that email. Try again.",
  );
});

test("an invalid email never reaches the network", async () => {
  let called = false;
  const spy = async () => {
    called = true;
    return new Response("{}");
  };
  expect(await postSubscription("not-an-email", spy)).toBe("That email doesn't look right.");
  expect(called).toBe(false);
});

test("a 422 answer passes its message through, success resolves null", async () => {
  const invalid = async () => new Response(JSON.stringify({ message: "Taken." }), { status: 422 });
  expect(await postSubscription("you@example.com", invalid)).toBe("Taken.");
  const ok = async () => new Response(JSON.stringify({ ok: true }));
  expect(await postSubscription("you@example.com", ok)).toBeNull();
});

test("the toggle starts from the saved theme, else the OS preference", () => {
  expect(resolveTheme("dark", false)).toBe("dark");
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme(null, true)).toBe("dark");
  expect(resolveTheme(null, false)).toBe("light");
  expect(resolveTheme("sepia", true)).toBe("dark");
});

test("blocked storage degrades instead of throwing", () => {
  const denied = {
    getItem: (): string | null => {
      throw new Error("denied");
    },
    setItem: (): void => {
      throw new Error("denied");
    },
  };
  expect(readStoredTheme(denied)).toBeNull();
  writeStoredTheme(denied, "dark");
});

test("post paths derive from the collection entry id", () => {
  expect(postSlug("hello.md")).toBe("hello");
  expect(postSlug("second.md")).toBe("second");
});
