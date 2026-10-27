// The members-only page. The loader sends signed-out visitors to
// `/sign-in`, so this component only ever renders for a signed-in member.
import { atom } from "ilha";
import { Link } from "@ilha/void";

import type { Props } from "./members.server.ts";
import { friendlyError, signOut } from "./_ceremony.ts";

export default function Members({ viewer }: Props) {
  const busy = atom(false);
  const error = atom<string | null>(null);

  async function leave() {
    if (busy()) {
      return;
    }
    busy.set(true);
    error.set(null);
    try {
      await signOut();
      window.location.href = "/";
    } catch (e) {
      error.set(friendlyError(e));
      busy.set(false);
    }
  }

  return (
    <div class="flex flex-col gap-4">
      <section class="card bg-base-100 shadow-sm">
        <div class="card-body gap-2">
          <h1 class="card-title text-2xl">Members</h1>
          <p>Welcome back, {viewer.displayName} — this page is only for signed-in members.</p>
          <p class="text-sm opacity-70">
            You proved it is you with a passkey, not a password. Put whatever is members-only here:
            your app's real content starts where this card ends.
          </p>
        </div>
      </section>
      <section class="card bg-base-100 shadow-sm">
        <div class="card-body gap-3">
          <h2 class="card-title text-xl">Your visit</h2>
          <dl class="flex flex-col gap-1 text-sm">
            <div class="flex gap-2">
              <dt class="opacity-70">Signed in as</dt>
              <dd class="font-medium">{viewer.handle}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="opacity-70">How</dt>
              <dd class="font-medium">Passkey on your device</dd>
            </div>
          </dl>
          <div class="flex flex-col gap-2 sm:flex-row">
            <Link href="/" class="btn btn-ghost min-h-11 sm:flex-1">
              Back home
            </Link>
            <button
              type="button"
              onclick={() => {
                void leave();
              }}
              disabled={busy()}
              class="btn btn-primary min-h-11 sm:flex-1"
            >
              {busy() ? "Signing out…" : "Sign out"}
            </button>
          </div>
          {error() ? (
            <p role="alert" class="alert alert-error text-sm">
              {error()}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
