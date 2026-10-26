export interface BrandInput {
  name: string;
  shortName: string;
  description: string;
  accent: string;
}
export function onAccent(accent: string): string;
export function initials(name: string): string;
export function faviconSvg(brand: BrandInput): string;
export function ogSvg(brand: BrandInput): string;
export function writeBrandAssets(brandPath?: string, publicDir?: string): void;
