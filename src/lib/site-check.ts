/** Domínios que NÃO contam como site próprio do negócio. */
const NAO_SITE = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "wa.me",
  "api.whatsapp.com",
  "whatsapp.com",
  "linktr.ee",
  "linklist.bio",
  "beacons.ai",
  "bio.link",
  "google.com",
  "goo.gl",
  "maps.app.goo.gl",
  "sites.google.com",
  "kyte.site",
  "ifood.com.br",
  "tiktok.com",
  "youtube.com",
  "t.me",
];

/** Retorna true apenas se a URL for um site próprio de verdade. */
export function isSiteProprio(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();
  if (!u) return false;
  return !NAO_SITE.some((d) => u.includes(d));
}
