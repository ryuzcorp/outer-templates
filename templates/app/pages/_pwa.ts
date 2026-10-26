import { registerSW } from "virtual:pwa-register";

// /guide/auto-update (Automatic reload): `immediate: true` registers the
// service worker right away so updates take control + reload open tabs.
registerSW({ immediate: true });

// The PWA install prompt. Browsers fire `beforeinstallprompt` when the app
// qualifies (installed manifest, icons, SW, HTTPS); until then — and on
// platforms without installs — there is nothing to offer, so the settings
// page hides its install button. This module loads on the client at startup
// (see layout.tsx), catches the one-shot event, and replays it to late
// subscribers.
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let promptEvent: InstallPrompt | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event as InstallPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    emit();
  });
}

export function installReady(): boolean {
  return promptEvent !== null;
}

export function onInstallReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Shows the browser's install prompt. The event is one-shot: after the user
// answers it is consumed, whatever they chose.
export async function installApp(): Promise<boolean> {
  const event = promptEvent;
  if (!event) {
    return false;
  }
  promptEvent = null;
  await event.prompt();
  const choice = await event.userChoice;
  emit();
  return choice.outcome === "accepted";
}
