// The nav in one place: `layout.tsx` renders these links in the header,
// the desktop sidebar, and the phone tab bar. Adding a page means one new
// route file plus one line here. Icons are Lucide icon nodes — pick any
// name from https://lucide.dev/icons and import it; no new component needed.
import { House, Settings } from "lucide";
import type { IconNode } from "lucide";

export interface NavItem {
  href: string;
  label: string;
  icon: IconNode;
}

export const NAV: readonly NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/settings", label: "Settings", icon: Settings },
];
