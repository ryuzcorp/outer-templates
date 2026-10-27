// Shared with the newsletter API route, the signup island, and their
// tests: one rule, one place. Keep it plain (no JSX, no atoms) so the
// island, the server route, and `bun test` can all import it.
export function newsletterError(email: string): string | null {
  const value = email.trim();
  if (!value) {
    return "Write your email first.";
  }
  if (value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "That email doesn't look right.";
  }
  return null;
}

// Parse an untrusted request body into a trimmed email or a 422 message.
// Non-string `email` values (numbers, arrays, objects) normalize to "" so
// the route answers 422 instead of throwing on `.trim()`.
export function newsletterRequest(body: unknown): { email: string } | { message: string } {
  const rawEmail =
    typeof body === "object" && body !== null && "email" in body ? body.email : undefined;
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
  const message = newsletterError(email);
  return message ? { message } : { email };
}

// Only a UNIQUE violation means "already on the list". D1 surfaces it as
// `UNIQUE constraint failed: <table>.<column>`; write limits, lost
// connections, and overload fail differently and must stay failures.
export function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE constraint failed");
}
// Same-origin gate for the signup route: without it any site could POST
// visitors' addresses here and list-bomb them. `Origin` (fetch) decides
// when present; otherwise `Sec-Fetch-Site` (navigations), otherwise the
// `Referer` origin — each compared to the request's own origin. No usable
// signal means forged, so fail closed.
export function isSameOriginRequest(request: Request): boolean {
  const origin = new URL(request.url).origin;
  const header = request.headers.get("origin");
  if (header !== null) {
    return header === origin;
  }
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) {
    return site === "same-origin";
  }
  const referer = request.headers.get("referer");
  if (referer !== null) {
    try {
      return new URL(referer).origin === origin;
    } catch {
      return false;
    }
  }
  return false;
}

// POST one signup; resolve with a user-facing failure message or null on
// success. `post` defaults to the global fetch and is injectable for tests.
// A rejected request (offline, DNS, reset connection) is a failure message,
// not a silent spinner stop — the caller shows the return value as `error`.
export type PostFn = (url: string, init: RequestInit) => Promise<Response>;
export async function postSubscription(
  email: string,
  post: PostFn = fetch,
): Promise<string | null> {
  const invalid = newsletterError(email);
  if (invalid) {
    return invalid;
  }
  let res: Response;
  try {
    res = await post("/api/newsletter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
  } catch {
    return "Couldn't save that email. Try again.";
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    return typeof body?.message === "string" && body.message
      ? body.message
      : "Couldn't save that email. Try again.";
  }
  return null;
}
