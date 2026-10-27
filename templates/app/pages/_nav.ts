// The nav in one place: `layout.tsx` renders these links in the header,
// the desktop sidebar, and the phone tab bar. Adding a page means one new
// route file plus one line here. Icons are keys into the map in
// `layout.tsx` — a page without a matching icon reuses one of these.
export interface NavItem {
  href: string;
  label: string;
  icon: "home" | "settings";
}

export const NAV: readonly NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
