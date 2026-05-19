import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Send, Gauge } from "lucide-react";
import { LandingTemplate, faqJsonLd, breadcrumbJsonLd, type LandingConfig } from "@/components/landing-template";

const PATH = "/disparo-em-massa-whatsapp";
const TITLE = "Disparo em massa no WhatsApp com prospecção geolocalizada — ZapScout";
const DESCRIPTION = "Encontre leads no mapa do Brasil e dispare mensagens personalizadas no WhatsApp com follow-ups automáticos. Sem listas frias.";

const FAQ_ITEMS = [
  { question: "É seguro fazer disparo em massa?", answer: "Sim. O ZapScout usa cadência inteligente e personalização por variáveis, reduzindo o risco de bloqueio comparado a listas frias." },
  { question: "Preciso ter API oficial do WhatsApp?", answer: "Não. Você conecta seu WhatsApp normalmente e configura a cadência diretamente na plataforma." },
  { question: "Como funciona o follow-up automático?", answer: "A IA monitora respostas e dispara mensagens de retorno em horários otimizados, sem você precisar lembrar." },
];

const config: LandingConfig = {
  currentPath: PATH,
  eyebrow: "📣 Disparo em massa inteligente",
  title: (
    <>Disparo no <span style={{ background: "var(--gradient-zap)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>WhatsApp</span> com leads quentes do mapa</>
  ),
  subtitle: "Ao invés de comprar listas frias, encontre empresas reais no Google Maps por nicho e região e converse personalizadamente — com follow-up automático.",
  features: {
    title: "Por que funciona melhor que listas frias",
    items: [
      { icon: MapPin, title: "Leads do Google Maps", description: "Sem listas vencidas. Cada lead vem com nome, endereço e categoria." },
      { icon: Send, title: "Variáveis e templates", description: "Personalize a mensagem com nome da empresa, cidade e segmento." },
      { icon: Gauge, title: "Cadência inteligente", description: "Ritmo controlado para evitar bloqueio e maximizar resposta." },
    ],
  },
  steps: {
    items: [
      { title: "Busque no mapa", description: "Escolha o nicho e a região onde quer prospectar." },
      { title: "Crie a campanha", description: "Use templates com variáveis automáticas por lead." },
      { title: "Dispare com IA", description: "Cadência segura e follow-up automático para cada resposta." },
    ],
  },
  bullets: {
    title: "Diferenciais",
    items: [
      "Leads reais e atualizados do Google Maps — não lista vencida",
      "Mensagens personalizadas com nome, cidade e segmento da empresa",
      "Cadência inteligente que reduz risco de bloqueio",
      "Follow-up automático com IA, sem você precisar lembrar",
    ],
  },
  faq: { items: FAQ_ITEMS },
  finalCta: {
    title: "Pare de comprar lista. Comece a prospectar.",
    subtitle: "Crie sua conta em 30 segundos. Sem cartão de crédito.",
    cta: { primary: { label: "Começar grátis", to: "/cadastro" } },
  },
};

export const Route = createFileRoute("/disparo-em-massa-whatsapp")({
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
        { name: "Disparo em massa no WhatsApp", item: PATH },
      ]),
    ],
  }),
  component: () => <LandingTemplate {...config} />,
});
