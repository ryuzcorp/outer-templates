import { expect, test } from "bun:test";

import { renderHtml } from "ilha/test";

import { appBrand, initials, onAccent } from "./_brand.ts";
import { initials as scriptInitials, onAccent as scriptOnAccent } from "../scripts/brand.mjs";
import Home from "./index.tsx";

test("the home page shows the brand name and description", async () => {
  const html = await renderHtml(() => <Home />, { markers: false, snapshot: false });
  expect(html).toContain(appBrand.name);
  expect(html).toContain(appBrand.description);
  expect(html).toContain("Nothing here yet");
});

test("brand initials take the first letter or two", () => {
  expect(initials("Pizza Calculator")).toBe("PC");
  expect(initials("Pizza")).toBe("P");
  expect(initials("Outer App")).toBe("OA");
});

test("white text wins on dark accents, black on light ones", () => {
  expect(onAccent("#000000")).toBe("#ffffff");
  expect(onAccent("#ffffff")).toBe("#000000");
  expect(onAccent("#4338ca")).toBe("#ffffff");
  expect(onAccent("#d9482b")).toBe("#000000");
});

test("the runtime brand helpers match the icon script", () => {
  for (const name of ["Outer App", "Pizza Calculator", "Kalkulator Pizzy", "A"]) {
    expect(initials(name)).toBe(scriptInitials(name));
  }
  for (const accent of ["#4338ca", "#d9482b", "#ffffff", "#000000", "#f5c518"]) {
    expect(onAccent(accent)).toBe(scriptOnAccent(accent));
  }
});
