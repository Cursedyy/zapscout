import { createFileRoute } from "@tanstack/react-router";
import { Home, MessageSquare, Clock } from "lucide-react";
import { LandingTemplate, faqJsonLd, breadcrumbJsonLd, type LandingConfig } from "@/components/landing-template";

const PATH = "/para/corretor-de-imoveis";
const TITLE = "Prospecção para corretor de imóveis — ZapScout";
const DESCRIPTION = "Capte proprietários, condomínios e empresas por região e abra conversa no WhatsApp. Prospecção ativa para corretores de imóveis.";

const FAQ_ITEMS = [
  { question: "Consigo filtrar por bairro?", answer: "Sim, o mapa do Brasil permite buscas por raio e cidade — refine para o bairro de interesse." },
  { question: "Tem template para captação de imóveis?", answer: "Sim, oferecemos templates prontos de captação e de oferta de visita com variáveis." },
  { question: "A IA cuida de qual parte?", answer: "A IA sugere o próximo passo, agenda follow-ups e devolve leads mornos à sua agenda." },
];

const config: LandingConfig = {
  currentPath: PATH,
  eyebrow: "🏠 Para corretores de imóveis",
  title: (
    <>Capte imóveis e clientes no <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>seu bairro</span></>
  ),
  subtitle: "Encontre condomínios, imobiliárias parceiras e empresas em expansão. Abra conversa no WhatsApp com pitch personalizado por bairro.",
  features: {
    title: "Pensado para corretores",
    items: [
      { icon: Home, title: "Busca por bairro", description: "Filtre por raio e tipo de imóvel direto no mapa do Brasil." },
      { icon: MessageSquare, title: "Mensagens de captação", description: "Templates de captação e oferta de visita pelo WhatsApp." },
      { icon: Clock, title: "Lembretes de follow-up", description: "Nunca esqueça de retornar para um lead morno. A IA cuida." },
    ],
  },
  steps: {
    items: [
      { title: "Defina o bairro", description: "Selecione a região onde você atua no mapa do Brasil." },
      { title: "Filtre o tipo", description: "Condomínios, empresas, profissionais — escolha o alvo." },
      { title: "Inicie conversas", description: "Envie a primeira mensagem e acompanhe respostas em um pipeline visual." },
    ],
  },
  faq: { items: FAQ_ITEMS },
  finalCta: {
    title: "Capte imóveis e clientes no seu bairro",
    subtitle: "Sem listas frias. Sem cartão de crédito.",
    cta: { primary: { label: "Começar grátis", to: "/cadastro" } },
  },
};

export const Route = createFileRoute("/para/corretor-de-imoveis")({
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
        { name: "Corretor de imóveis", item: PATH },
      ]),
    ],
  }),
  component: () => <LandingTemplate {...config} />,
});
