import { createFileRoute } from "@tanstack/react-router";
import { Shield, MessageSquare, RefreshCw } from "lucide-react";
import { LandingTemplate, faqJsonLd, breadcrumbJsonLd, type LandingConfig } from "@/components/landing-template";

const PATH = "/para/seguros";
const TITLE = "Prospecção para corretora de seguros — ZapScout";
const DESCRIPTION = "Encontre empresas, frotas e comércios na sua região para oferecer seguro empresarial, auto e patrimonial pelo WhatsApp.";

const FAQ_ITEMS = [
  { question: "Quais ramos consigo prospectar?", answer: "Seguro empresarial, frota, patrimonial e responsabilidade civil — filtre comércios, indústrias e prestadores no mapa." },
  { question: "Posso prospectar para renovação?", answer: "Sim. Use a IA para agendar follow-ups antes do vencimento típico das apólices do ramo." },
  { question: "Funciona para corretor autônomo?", answer: "Sim. O ZapScout foi pensado tanto para corretoras quanto para corretores autônomos que prospectam ativamente." },
];

const config: LandingConfig = {
  currentPath: PATH,
  eyebrow: "🛡️ Para corretoras e corretores de seguros",
  title: (
    <>Capte empresas e frotas para <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>seguro empresarial</span></>
  ),
  subtitle: "Encontre comércios, indústrias e prestadores na sua região e ofereça cotações de seguro direto no WhatsApp do decisor.",
  features: {
    title: "Pensado para corretagem",
    items: [
      { icon: Shield, title: "Empresas-alvo no mapa", description: "Filtre comércios e indústrias por região para ofertar seguro empresarial e patrimonial." },
      { icon: MessageSquare, title: "Cotação por WhatsApp", description: "Templates com variáveis para enviar pitch personalizado de cotação." },
      { icon: RefreshCw, title: "Follow-up de renovação", description: "A IA agenda retornos antes do vencimento típico de apólices do ramo." },
    ],
  },
  steps: {
    items: [
      { title: "Selecione cidade e ramo", description: "Defina região de atuação e tipo de empresa-alvo." },
      { title: "Personalize o pitch", description: "Use variáveis (nome, cidade, segmento) para falar um-a-um." },
      { title: "Acompanhe o pipeline", description: "Cotações enviadas, em análise e fechadas — tudo num lugar só." },
    ],
  },
  faq: { items: FAQ_ITEMS },
  finalCta: {
    title: "Pronto para captar mais segurados?",
    subtitle: "Sem listas frias. Sem cartão de crédito.",
    cta: { primary: { label: "Começar grátis", to: "/cadastro" } },
  },
};

export const Route = createFileRoute("/para/seguros")({
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
        { name: "Seguros", item: PATH },
      ]),
    ],
  }),
  component: () => <LandingTemplate {...config} />,
});
