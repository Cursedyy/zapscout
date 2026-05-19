import { createFileRoute } from "@tanstack/react-router";
import { Map, MessageSquare, Bot } from "lucide-react";
import { LandingTemplate, faqJsonLd, breadcrumbJsonLd, type LandingConfig } from "@/components/landing-template";

const PATH = "/para/advocacia";
const TITLE = "Prospecção para advocacia — ZapScout";
const DESCRIPTION = "Encontre empresas e profissionais por região e ofereça serviços jurídicos pelo WhatsApp. Captação ativa para escritórios de advocacia.";

const FAQ_ITEMS = [
  { question: "Posso prospectar clientes pelo WhatsApp como advogado?", answer: "Sim, desde que respeite o Código de Ética da OAB e envie mensagens informativas, sem oferta direta de serviços." },
  { question: "Quais segmentos posso encontrar?", answer: "Comércios, indústrias, escritórios, consultórios e profissionais autônomos por cidade e bairro." },
  { question: "Preciso ter lista de contatos?", answer: "Não. O ZapScout busca empresas reais no Google Maps a partir do nicho e região que você escolher." },
];

const config: LandingConfig = {
  currentPath: PATH,
  eyebrow: "⚖️ Para escritórios de advocacia",
  title: (
    <>Capte clientes jurídicos por <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>região</span></>
  ),
  subtitle: "Encontre empresas e profissionais autônomos na sua cidade, abra conversas no WhatsApp e ofereça seus serviços com follow-up automático.",
  features: {
    title: "Pensado para escritórios",
    items: [
      { icon: Map, title: "Empresas por segmento", description: "Filtre comércios e indústrias que precisam de assessoria trabalhista, tributária ou empresarial." },
      { icon: MessageSquare, title: "Abordagem profissional", description: "Mensagens com tom adequado à OAB, variáveis e horários inteligentes." },
      { icon: Bot, title: "Follow-up com IA", description: "A IA acompanha leads frios e devolve aos quentes para sua agenda." },
    ],
  },
  steps: {
    items: [
      { title: "Escolha a região", description: "Selecione o estado e a cidade no mapa do Brasil." },
      { title: "Filtre o segmento", description: "Escolha o tipo de empresa que costuma virar cliente do seu escritório." },
      { title: "Abra conversa", description: "Envie a primeira mensagem e deixe a IA cuidar dos follow-ups." },
    ],
  },
  faq: { items: FAQ_ITEMS },
  finalCta: {
    title: "Pronto para captar clientes jurídicos?",
    subtitle: "Sem listas frias. Sem cartão de crédito.",
    cta: { primary: { label: "Começar grátis", to: "/cadastro" } },
  },
};

export const Route = createFileRoute("/para/advocacia")({
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
        { name: "Advocacia", item: PATH },
      ]),
    ],
  }),
  component: () => <LandingTemplate {...config} />,
});
