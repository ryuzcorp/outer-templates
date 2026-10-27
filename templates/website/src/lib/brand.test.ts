import { expect, test } from "bun:test";

import { initials as scriptInitials, onAccent as scriptOnAccent } from "../../scripts/brand.mjs";
import { initials, onAccent, pageTitle, siteBrand } from "./brand.ts";
import { siteUrl } from "./site.ts";

test("page titles append the brand", () => {
  expect(pageTitle()).toBe(siteBrand.name);
  expect(pageTitle("Blog")).toBe(`Blog | ${siteBrand.name}`);
});

test("brand initials take the first letter or two", () => {
  expect(initials("Outer Site")).toBe("OS");
  expect(initials("Pizza Calculator")).toBe("PC");
  expect(initials("Outer")).toBe("O");
});

test("white text wins on dark accents, black on light ones", () => {
  expect(onAccent("#000000")).toBe("#ffffff");
  expect(onAccent("#ffffff")).toBe("#000000");
  expect(onAccent("#4338ca")).toBe("#ffffff");
  expect(onAccent("#d9482b")).toBe("#000000");
});

test("the runtime brand helpers match the icon script", () => {
  for (const name of ["Outer Site", "Pizza Calculator", "Kalkulator Pizzy", "A"]) {
    expect(initials(name)).toBe(scriptInitials(name));
  }
  for (const accent of ["#4338ca", "#d9482b", "#ffffff", "#000000", "#f5c518"]) {
    expect(onAccent(accent)).toBe(scriptOnAccent(accent));
  }
});

test("feed links default to Outer until SITE_URL is set", () => {
  expect(siteUrl()).toBe("https://outer.now");
});
