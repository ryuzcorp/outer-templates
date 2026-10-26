import { registerSW } from "virtual:pwa-register";

// /guide/auto-update (Automatic reload): `immediate: true` registers the
// service worker right away so updates take control + reload open tabs.
registerSW({ immediate: true });
