// Shared with the newsletter API route and its test: one rule, one place.
// Keep it plain (no JSX, no atoms) so both the island and the server can
// import it.
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
