import { createFileRoute } from "@tanstack/react-router";
import { Building2, MessageSquare, FileText } from "lucide-react";
import { LandingTemplate, faqJsonLd, breadcrumbJsonLd, type LandingConfig } from "@/components/landing-template";

const PATH = "/para/contabilidade";
const TITLE = "Prospecção para contabilidade — ZapScout";
const DESCRIPTION = "Encontre MEIs, pequenas empresas e profissionais autônomos sem contador na sua região e capte clientes pelo WhatsApp.";

const FAQ_ITEMS = [
  { question: "Como encontro empresas sem contador?", answer: "O ZapScout busca empresas reais no Google Maps por segmento e região — você prospecta MEIs e pequenos negócios que costumam estar abertos a trocar de contador." },
  { question: "Posso filtrar por porte da empresa?", answer: "Sim, por segmento e região. Isso costuma corresponder bem ao porte (ex.: salões, restaurantes, comércios de bairro)." },
  { question: "A mensagem é personalizada?", answer: "Sim. Use variáveis como nome da empresa e cidade no template do WhatsApp para falar como se fosse um a um." },
];

const config: LandingConfig = {
  currentPath: PATH,
  eyebrow: "📊 Para escritórios de contabilidade",
  title: (
    <>Capte MEIs e pequenas empresas na <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>sua região</span></>
  ),
  subtitle: "Encontre comércios, prestadores e profissionais autônomos no mapa, abra conversa no WhatsApp e ofereça honorários competitivos com follow-up automático.",
  features: {
    title: "Pensado para escritórios contábeis",
    items: [
      { icon: Building2, title: "MEIs e PMEs por segmento", description: "Mapeie restaurantes, salões, comércios e prestadores na cidade que você atende." },
      { icon: MessageSquare, title: "Abordagem consultiva", description: "Templates focados em economia tributária e migração de contador." },
      { icon: FileText, title: "Pipeline de propostas", description: "Acompanhe leads em estágios: orçamento enviado, em análise, fechado." },
    ],
  },
  steps: {
    items: [
      { title: "Escolha a região", description: "Estado, cidade e bairro onde você atende clientes." },
      { title: "Filtre por segmento", description: "Comércios e serviços com maior chance de virar cliente." },
      { title: "Abra conversa", description: "Envie a mensagem inicial e deixe a IA cuidar do follow-up." },
    ],
  },
  faq: { items: FAQ_ITEMS },
  finalCta: {
    title: "Pronto para captar novos clientes contábeis?",
    subtitle: "Sem listas frias. Sem cartão de crédito.",
    cta: { primary: { label: "Começar grátis", to: "/cadastro" } },
  },
};

export const Route = createFileRoute("/para/contabilidade")({
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
        { name: "Contabilidade", item: PATH },
      ]),
    ],
  }),
  component: () => <LandingTemplate {...config} />,
});
