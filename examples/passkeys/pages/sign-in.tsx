// The sign-in page: create an account or sign in with a passkey, no
// password anywhere. Each button starts a ceremony with the page action,
// talks to the device with `navigator.credentials`, and finishes with the
// action again; success lands on `/members`.
import { atom, watch } from "ilha";
import { Link } from "@ilha/void";

import type { Props } from "./sign-in.server.ts";
import { friendlyError, loginWithPasskey, registerWithPasskey, signOut } from "./_ceremony.ts";

const TABS = [
  { value: "register", label: "Create account" },
  { value: "login", label: "Sign in" },
] as const;

type Mode = (typeof TABS)[number]["value"];

function SignedIn({ handle, displayName }: { handle: string; displayName: string }) {
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
    <section class="card bg-base-100 shadow-sm">
      <div class="card-body items-center gap-3 py-10 text-center">
        <h1 class="text-2xl font-bold">You are signed in{displayName ? `, ${displayName}` : ""}</h1>
        <p class="max-w-xs text-sm opacity-70">
          Signed in as “{handle}” with a passkey. No password to lose or leak.
        </p>
        <div class="mt-2 flex w-full max-w-xs flex-col gap-2">
          <Link href="/members" class="btn btn-primary min-h-11 w-full">
            Go to members
          </Link>
          <button
            type="button"
            onclick={() => {
              void leave();
            }}
            disabled={busy()}
            class="btn btn-ghost min-h-11 w-full"
          >
            {busy() ? "Signing out…" : "Sign out"}
          </button>
        </div>
        {error() ? (
          <p role="alert" class="alert alert-error mt-2 max-w-xs text-sm">
            {error()}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Ceremony() {
  const mode = atom<Mode>("register");
  const name = atom("");
  const busy = atom(false);
  const error = atom<string | null>(null);
  const supported = atom(true);
  watch.once(() => {
    if (typeof window !== "undefined" && !("PublicKeyCredential" in window)) {
      supported.set(false);
    }
  });

  async function go(next: Mode) {
    if (busy() || !supported()) {
      return;
    }
    if (next === "register" && !name().trim()) {
      error.set("Enter a name for your account first.");
      return;
    }
    busy.set(true);
    error.set(null);
    try {
      if (next === "register") {
        await registerWithPasskey(name().trim());
      } else {
        await loginWithPasskey(name().trim());
      }
      window.location.href = "/members";
    } catch (e) {
      error.set(friendlyError(e));
      busy.set(false);
    }
  }

  function choose(next: Mode) {
    mode.set(next);
    error.set(null);
  }

  return (
    <div class="flex flex-col gap-4">
      <section class="card bg-base-100 shadow-sm">
        <div class="card-body gap-4">
          <div>
            <h1 class="card-title text-2xl">Sign in with a passkey</h1>
            <p class="mt-1 text-sm opacity-70">
              No password to remember. Your phone or computer checks it is you — Face ID, a
              fingerprint, or a PIN.
            </p>
          </div>
          <div role="tablist" aria-label="Create account or sign in" class="tabs tabs-box w-full">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={mode() === tab.value}
                onclick={() => choose(tab.value)}
                class={`tab min-h-11 flex-1 ${mode() === tab.value ? "tab-active" : ""}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div class="flex flex-col gap-2">
            <label for="passkey-name" class="text-sm font-medium">
              {mode() === "register" ? "Pick a name — that is your account" : "Your name"}
            </label>
            <input
              id="passkey-name"
              name="username"
              type="text"
              autocomplete="username webauthn"
              placeholder={
                mode() === "register" ? "e.g. Sam" : "e.g. Sam (or blank on this device)"
              }
              value={name()}
              oninput={(event) => name.set(event.currentTarget.value)}
              disabled={busy() || !supported()}
              maxlength={40}
              class="input input-bordered min-h-11 w-full"
            />
            <p class="text-sm opacity-70">
              {mode() === "register"
                ? "Anyone visiting your app picks their own name and adds a passkey on their device."
                : "Leave it blank if this device already remembers you."}
            </p>
          </div>
          <button
            type="button"
            onclick={() => {
              void go(mode());
            }}
            disabled={busy() || !supported()}
            class="btn btn-primary min-h-11 w-full"
          >
            {busy()
              ? "Check your device…"
              : mode() === "register"
                ? "Create account with passkey"
                : "Sign in with passkey"}
          </button>
          {error() ? (
            <p role="alert" class="alert alert-error text-sm">
              {error()}
            </p>
          ) : null}
          {!supported() ? (
            <p role="alert" class="alert alert-warning text-sm">
              This browser cannot use passkeys. Open this page in a recent Safari, Chrome, Edge, or
              Firefox instead.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function SignIn({ viewer }: Props) {
  if (viewer) {
    return <SignedIn handle={viewer.handle} displayName={viewer.displayName} />;
  }
  return <Ceremony />;
}
