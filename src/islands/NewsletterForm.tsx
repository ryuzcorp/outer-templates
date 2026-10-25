import { atom } from "ilha";

import { newsletterError, postSubscription } from "../lib/newsletter.ts";
// A newsletter signup island: static HTML on first paint, hydrated in the
// browser via its `client:load` directive (see `src/pages/index.astro`).
// Islands are plain Ilha components with JSON-only props — never forward an
// Astro `<slot />` into one (Ilha components don't support slot forwarding;
// pass data through props).
export default function NewsletterForm() {
  const email = atom("");
  const error = atom<string | null>(null);
  const done = atom(false);
  const pending = atom(false);

  async function submit(event: Event) {
    event.preventDefault();
    const message = newsletterError(email());
    error.set(message);
    if (message) {
      return;
    }
    pending.set(true);
    try {
      // A rejected request resolves to a message (never throws), so an
      // offline visitor sees *Couldn't save that email* instead of a
      // spinner that just stops.
      const failure = await postSubscription(email());
      if (failure) {
        error.set(failure);
        return;
      }
      done.set(true);
    } finally {
      pending.set(false);
    }
  }

  if (done()) {
    return (
      <p role="status" class="alert alert-success alert-soft">
        You're on the list.
      </p>
    );
  }
  return (
    <form onsubmit={submit} class="join w-full">
      <input
        type="email"
        name="email"
        aria-label="Email"
        placeholder="you@example.com"
        maxlength={320}
        value={email()}
        oninput={(event) => email.set(event.currentTarget.value)}
        class="input join-item grow"
      />
      <button type="submit" disabled={pending()} class="btn btn-primary join-item">
        Subscribe
      </button>
      {error() ? <p class="text-error join-item w-full">{error()}</p> : null}
    </form>
  );
}
