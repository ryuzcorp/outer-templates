// Absolute links (the RSS feed, the sitemap) need the site's public
// origin, which the build can't know: set SITE_URL in the environment when
// the site has its own domain. Until then links point at Outer.
export function siteUrl(): string {
  const fromEnv = (import.meta.env.SITE_URL as string | undefined)?.trim();
  return (fromEnv || "https://outer.now").replace(/\/+$/, "");
}
