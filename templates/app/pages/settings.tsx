import { atom, watch } from "ilha";

import { installApp, installReady, onInstallReady } from "./_pwa.ts";
import { appBrand, onAccent } from "./_brand.ts";

type ThemeMode = "system" | "light" | "dark";

const MODES: readonly { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function storedMode(): ThemeMode {
  try {
    const saved = window.localStorage.getItem("theme");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  } catch {
    // Storage blocked (private mode, denied cookies): follow the OS.
    return "system";
  }
}

// Apply the mode to daisyUI: an explicit `light`/`dark` wins, `system`
// follows the OS preference. Runs in the browser only.
function applyMode(mode: ThemeMode) {
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function ThemeControl() {
  const mode = atom<ThemeMode>("system");
  const mounted = atom(false);
  watch.once(() => {
    if (typeof window === "undefined") {
      return;
    }
    mode.set(storedMode());
    applyMode(mode());
    mounted.set(true);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const follow = () => {
      if (mode() === "system") {
        applyMode("system");
      }
    };
    media?.addEventListener("change", follow);
    return () => media?.removeEventListener("change", follow);
  });

  function choose(next: ThemeMode) {
    mode.set(next);
    try {
      window.localStorage.setItem("theme", next);
    } catch {
      // Persistence unavailable; the document theme still applies.
    }
    applyMode(next);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="card-title text-xl">Appearance</h2>
      <div role="group" aria-label="Theme" class="join">
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={!mounted()}
            aria-pressed={mode() === option.value}
            onclick={() => choose(option.value)}
            class={`btn join-item ${mode() === option.value ? "btn-primary" : "btn-ghost"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p class="text-sm opacity-70">System follows your phone or computer. Saved on this device.</p>
    </div>
  );
}

function InstallControl() {
  const ready = atom(false);
  const busy = atom(false);
  watch.once(() => {
    if (typeof window === "undefined") {
      return;
    }
    ready.set(installReady());
    return onInstallReady(() => ready.set(installReady()));
  });

  // Hidden until the browser offers an install: most desktops never fire
  // `beforeinstallprompt`, and an installed app fires `appinstalled`. The
  // whole section (card included) stays out until then.
  if (!ready()) {
    return null;
  }
  return (
    <section class="card bg-base-100 shadow-sm">
      <div class="card-body gap-2">
        <h2 class="card-title text-xl">Install</h2>
        <div>
          <button
            type="button"
            disabled={busy()}
            onclick={async () => {
              busy.set(true);
              try {
                await installApp();
              } finally {
                busy.set(false);
              }
            }}
            class="btn btn-primary"
          >
            {busy() ? "Installing…" : "Install app"}
          </button>
        </div>
        <p class="text-sm opacity-70">
          Adds {appBrand.name} to your home screen for offline starts.
        </p>
      </div>
    </section>
  );
}

export default function Settings() {
  return (
    <div class="flex flex-col gap-4">
      <h1 class="card-title text-2xl">Settings</h1>
      <section class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <ThemeControl />
        </div>
      </section>
      <InstallControl />
      <section class="card bg-base-100 shadow-sm">
        <div class="card-body gap-2">
          <h2 class="card-title text-xl">About</h2>
          <dl class="flex flex-col gap-1 text-sm">
            <div class="flex gap-2">
              <dt class="opacity-70">Name</dt>
              <dd>{appBrand.name}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="opacity-70">Home-screen label</dt>
              <dd>{appBrand.shortName}</dd>
            </div>
            <div class="flex items-center gap-2">
              <dt class="opacity-70">Accent</dt>
              <dd class="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  class="inline-block h-5 w-5 rounded"
                  style={`background:${appBrand.accent};color:${onAccent(appBrand.accent)}`}
                />
                {appBrand.accent}
              </dd>
            </div>
            <div class="flex gap-2">
              <dt class="opacity-70">Description</dt>
              <dd>{appBrand.description}</dd>
            </div>
          </dl>
          <p class="text-sm opacity-70">
            These come from brand.json — edit that file to rebrand the app.
          </p>
        </div>
      </section>
    </div>
  );
}
