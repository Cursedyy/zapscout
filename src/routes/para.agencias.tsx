import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, MessageSquare, TrendingUp } from "lucide-react";
import { LandingTemplate, faqJsonLd, breadcrumbJsonLd, type LandingConfig } from "@/components/landing-template";

const PATH = "/para/agencias";
const TITLE = "Prospecção para agências de marketing — ZapScout";
const DESCRIPTION = "Encontre comércios, restaurantes e PMEs sem presença digital na sua região e prospecte novos contratos de marketing pelo WhatsApp.";

const FAQ_ITEMS = [
  { question: "Como identifico empresas sem marketing?", answer: "Filtre por segmento e região: comércios locais sem site/instagram costumam aparecer com pouca presença digital — alvos ideais." },
  { question: "Funciona para agência de tráfego pago?", answer: "Sim. Prospecte e-commerces locais, clínicas e prestadores que faturariam mais com mídia paga bem feita." },
  { question: "Posso revender o ZapScout para clientes?", answer: "Não no momento, mas você pode usá-lo internamente para acelerar a captação da sua agência." },
];

const config: LandingConfig = {
  currentPath: PATH,
  eyebrow: "🚀 Para agências de marketing",
  title: (
    <>Capte contratos de marketing por <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>cidade</span></>
  ),
  subtitle: "Encontre PMEs sem presença digital, clínicas, restaurantes e e-commerces locais — abra conversa no WhatsApp com pitch personalizado por segmento.",
  features: {
    title: "Pensado para agências",
    items: [
      { icon: Megaphone, title: "Empresas-alvo por nicho", description: "Comércios locais, clínicas, restaurantes — filtre por segmento e região." },
      { icon: MessageSquare, title: "Pitch personalizado", description: "Templates com variáveis para auditoria digital ou oferta de tráfego pago." },
      { icon: TrendingUp, title: "Pipeline de propostas", description: "Acompanhe diagnósticos enviados, reuniões marcadas e contratos fechados." },
    ],
  },
  steps: {
    items: [
      { title: "Defina o ICP", description: "Segmento e região onde sua agência entrega melhor resultado." },
      { title: "Abra conversa", description: "Envie auditoria gratuita ou oferta de tráfego com variáveis." },
      { title: "Feche contratos", description: "Follow-up automático com IA até a assinatura." },
    ],
  },
  bullets: {
    title: "Por que agências escolhem o ZapScout",
    items: [
      "Leads reais do Google Maps — não lista comprada vencida",
      "Mensagens personalizadas por segmento e cidade",
      "Pipeline visual para acompanhar o funil comercial",
      "Cadência inteligente que evita bloqueio do WhatsApp",
    ],
  },
  faq: { items: FAQ_ITEMS },
  finalCta: {
    title: "Pronto para acelerar a captação da sua agência?",
    subtitle: "Sem listas frias. Sem cartão de crédito.",
    cta: { primary: { label: "Começar grátis", to: "/cadastro" } },
  },
};

export const Route = createFileRoute("/para/agencias")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `https://zapscout.com.br${PATH}` },
    ],
    links: [{ rel: "canonical", href: `https://zapscout.com.br${PATH}` }],
    scripts: [
      faqJsonLd(FAQ_ITEMS),
      breadcrumbJsonLd([
        { name: "Home", item: "/" },
        { name: "Agências", item: PATH },
      ]),
    ],
  }),
  component: () => <LandingTemplate {...config} />,
});
