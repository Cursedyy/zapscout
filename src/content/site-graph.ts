// Single source of truth for site interlinking.
// Every public/marketing page registers here with topics and intent.
// RelatedLinks + SiteFooter + sitemap.xml all read from this graph.

export type PageKind = "landing" | "niche" | "blog" | "app" | "feature";
export type Intent = "tofu" | "mofu" | "bofu"; // top/middle/bottom of funnel

export interface SiteNode {
  path: string;
  title: string;
  short: string; // short label for footer/related cards
  description: string; // 1-line teaser for related cards
  kind: PageKind;
  intent: Intent;
  topics: string[]; // tags used for relatedness scoring
  cta?: { label: string; to: string };
  // sitemap hints
  priority?: string;
  changefreq?: "weekly" | "monthly" | "yearly";
}

export const NICHES = [
  "advocacia",
  "energia-solar",
  "corretor-de-imoveis",
  "contabilidade",
  "seguros",
  "agencias",
] as const;

export const SITE: SiteNode[] = [
  {
    path: "/",
    title: "ZapScout — Prospecte. Conecte. Venda.",
    short: "Home",
    description: "Encontre clientes no mapa e fale no WhatsApp em segundos.",
    kind: "landing",
    intent: "bofu",
    topics: ["prospeccao", "whatsapp", "mapa", "leads"],
    cta: { label: "Começar grátis", to: "/cadastro" },
    priority: "1.0",
    changefreq: "weekly",
  },
  // Feature landings
  {
    path: "/disparo-em-massa-whatsapp",
    title: "Disparo em massa no WhatsApp com prospecção geolocalizada",
    short: "Disparo em massa WhatsApp",
    description: "Envie mensagens personalizadas para leads encontrados no mapa, com follow-ups automáticos.",
    kind: "feature",
    intent: "bofu",
    topics: ["whatsapp", "disparo", "automacao", "campanhas"],
    cta: { label: "Testar grátis", to: "/cadastro" },
    priority: "0.9",
    changefreq: "monthly",
  },
  // Niche landings
  {
    path: "/para/advocacia",
    title: "Prospecção de clientes para advocacia",
    short: "Para advocacia",
    description: "Encontre empresas e profissionais por região e ofereça serviços jurídicos no WhatsApp.",
    kind: "niche",
    intent: "mofu",
    topics: ["advocacia", "prospeccao", "b2b", "whatsapp"],
    cta: { label: "Prospectar agora", to: "/cadastro" },
    priority: "0.8",
    changefreq: "monthly",
  },
  {
    path: "/para/energia-solar",
    title: "Prospecção de clientes para energia solar",
    short: "Para energia solar",
    description: "Encontre comércios e indústrias com alto consumo elétrico em cada cidade.",
    kind: "niche",
    intent: "mofu",
    topics: ["energia-solar", "prospeccao", "b2b", "mapa"],
    cta: { label: "Prospectar agora", to: "/cadastro" },
    priority: "0.8",
    changefreq: "monthly",
  },
  {
    path: "/para/corretor-de-imoveis",
    title: "Prospecção para corretor de imóveis",
    short: "Para corretores",
    description: "Encontre proprietários, condomínios e empresas para captação ativa via WhatsApp.",
    kind: "niche",
    intent: "mofu",
    topics: ["corretor-de-imoveis", "prospeccao", "whatsapp"],
    cta: { label: "Prospectar agora", to: "/cadastro" },
    priority: "0.8",
    changefreq: "monthly",
  },
  {
    path: "/para/contabilidade",
    title: "Prospecção para contabilidade",
    short: "Para contabilidade",
    description: "Encontre MEIs e pequenas empresas sem contador na sua região.",
    kind: "niche",
    intent: "mofu",
    topics: ["contabilidade", "prospeccao", "b2b", "whatsapp"],
    cta: { label: "Prospectar agora", to: "/cadastro" },
    priority: "0.8",
    changefreq: "monthly",
  },
  {
    path: "/para/seguros",
    title: "Prospecção para corretora de seguros",
    short: "Para seguros",
    description: "Capte empresas e frotas para seguro empresarial e patrimonial.",
    kind: "niche",
    intent: "mofu",
    topics: ["seguros", "prospeccao", "b2b", "whatsapp"],
    cta: { label: "Prospectar agora", to: "/cadastro" },
    priority: "0.8",
    changefreq: "monthly",
  },
  {
    path: "/para/agencias",
    title: "Prospecção para agências de marketing",
    short: "Para agências",
    description: "Capte contratos com PMEs e e-commerces locais por região.",
    kind: "niche",
    intent: "mofu",
    topics: ["agencias", "prospeccao", "b2b", "whatsapp", "marketing"],
    cta: { label: "Prospectar agora", to: "/cadastro" },
    priority: "0.8",
    changefreq: "monthly",
  },
  // Blog
  {
    path: "/blog",
    title: "Blog ZapScout — guias de prospecção e WhatsApp",
    short: "Blog",
    description: "Guias práticos de prospecção, disparo no WhatsApp e captação por nicho.",
    kind: "blog",
    intent: "tofu",
    topics: ["prospeccao", "whatsapp", "leads", "marketing"],
    priority: "0.7",
    changefreq: "weekly",
  },
];

// Read-only references to app pages — used by SiteFooter so visitors that already
// converted can jump back into the product. App routes are protected; not in sitemap.
export const APP_PAGES: { path: string; short: string }[] = [
  { path: "/app", short: "Dashboard" },
  { path: "/app/mapa", short: "Mapa do Brasil" },
  { path: "/app/leads", short: "Meus leads" },
  { path: "/app/campanhas", short: "Campanhas" },
  { path: "/app/whatsapp", short: "WhatsApp" },
  { path: "/app/ia", short: "IA" },
];

/**
 * Score relatedness between two nodes. Same kind boosts slightly, but
 * shared topics dominate so a blog post pulls the matching niche landing.
 */
function scoreRelatedness(a: SiteNode, b: SiteNode): number {
  if (a.path === b.path) return -Infinity;
  const shared = a.topics.filter((t) => b.topics.includes(t)).length;
  let score = shared * 10;
  if (a.kind === b.kind) score += 1;
  // Always favor pulling users from tofu → bofu
  if (a.intent === "tofu" && b.intent !== "tofu") score += 2;
  return score;
}

export function getRelatedLinks(currentPath: string, limit = 3): SiteNode[] {
  const current = SITE.find((n) => n.path === currentPath);
  if (!current) return SITE.filter((n) => n.path !== currentPath).slice(0, limit);
  return [...SITE]
    .map((n) => ({ node: n, score: scoreRelatedness(current, n) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.node);
}

export function getNichePages(): SiteNode[] {
  return SITE.filter((n) => n.kind === "niche");
}

export function getFeaturePages(): SiteNode[] {
  return SITE.filter((n) => n.kind === "feature");
}
