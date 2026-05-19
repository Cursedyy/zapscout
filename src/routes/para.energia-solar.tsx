import { createFileRoute } from "@tanstack/react-router";
import { Sun, MessageSquare, BarChart3 } from "lucide-react";
import { LandingTemplate, faqJsonLd, breadcrumbJsonLd, type LandingConfig } from "@/components/landing-template";

const PATH = "/para/energia-solar";
const TITLE = "Prospecção para energia solar — ZapScout";
const DESCRIPTION = "Encontre comércios e indústrias com alto consumo elétrico em cada cidade e feche projetos solares pelo WhatsApp.";

const FAQ_ITEMS = [
  { question: "Como o ZapScout identifica clientes de alto consumo?", answer: "Filtramos segmentos do Google Maps que historicamente têm conta de luz elevada: supermercados, indústrias, postos, galpões, hotéis." },
  { question: "Consigo enviar simulação de economia?", answer: "Sim. Você pode usar variáveis da empresa-alvo no template do WhatsApp para personalizar a oferta." },
  { question: "Funciona em cidades pequenas?", answer: "Sim. O mapa cobre todo o Brasil — basta selecionar estado e cidade." },
];

const config: LandingConfig = {
  currentPath: PATH,
  eyebrow: "☀️ Para instaladoras de energia solar",
  title: (
    <>Encontre empresas com <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>alta conta de luz</span></>
  ),
  subtitle: "Mapeie supermercados, postos, indústrias e galpões na sua região e ofereça simulação de economia direto no WhatsApp do decisor.",
  features: {
    title: "Pensado para instaladoras",
    items: [
      { icon: Sun, title: "Segmentos de alto consumo", description: "Supermercados, indústrias, postos, galpões — todos no mapa interativo." },
      { icon: MessageSquare, title: "Pitch via WhatsApp", description: "Envie simulação de economia com variáveis da empresa-alvo." },
      { icon: BarChart3, title: "Pipeline visual", description: "Acompanhe propostas, visitas e fechamentos sem planilha." },
    ],
  },
  steps: {
    items: [
      { title: "Selecione a cidade", description: "Defina raio de atuação no mapa do Brasil." },
      { title: "Filtre por segmento", description: "Escolha os tipos de empresa com maior conta de luz." },
      { title: "Envie a simulação", description: "Use templates com variáveis e deixe a IA fazer o follow-up." },
    ],
  },
  faq: { items: FAQ_ITEMS },
  finalCta: {
    title: "Capte projetos solares na sua região",
    subtitle: "Sem listas compradas. Leads reais do Google Maps.",
    cta: { primary: { label: "Começar grátis", to: "/cadastro" } },
  },
};

export const Route = createFileRoute("/para/energia-solar")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: PATH },
    ],
    links: [{ rel: "canonical", href: PATH }],
    scripts: [
      faqJsonLd(FAQ_ITEMS),
      breadcrumbJsonLd([
        { name: "Home", item: "/" },
        { name: "Energia solar", item: PATH },
      ]),
    ],
  }),
  component: () => <LandingTemplate {...config} />,
});
