import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Send, Gauge, Shield, Repeat, Users } from "lucide-react";
import { LandingTemplate, faqJsonLd, breadcrumbJsonLd, type LandingConfig } from "@/components/landing-template";

const PATH = "/disparo-em-massa-whatsapp";
const TITLE = "Disparo em Massa no WhatsApp com Leads do Mapa | ZapScout";
const DESCRIPTION =
  "Faça disparo em massa no WhatsApp com leads reais do Google Maps, mensagens personalizadas e follow-up automático por IA. Cadência segura, sem listas frias.";

// Palavras-chave alvo: "disparo em massa whatsapp", "envio em massa whatsapp",
// "mensagens em massa whatsapp", "prospecção whatsapp", "ferramenta disparo whatsapp",
// "disparo whatsapp sem bloqueio", "campanha whatsapp em massa".

const FAQ_ITEMS = [
  {
    question: "O que é disparo em massa no WhatsApp?",
    answer:
      "Disparo em massa no WhatsApp é o envio simultâneo de mensagens personalizadas para vários contatos a partir de uma única ferramenta. No ZapScout, esses contatos são empresas reais extraídas do Google Maps por nicho e região, e cada mensagem é montada com variáveis (nome da empresa, cidade, segmento) para soar como uma conversa individual.",
  },
  {
    question: "É seguro fazer disparo em massa no WhatsApp?",
    answer:
      "Sim, desde que se respeite cadência, personalização e qualidade da lista. O ZapScout usa intervalos inteligentes entre envios, randomização de horários e variáveis por lead, o que reduz drasticamente o risco de bloqueio comparado a planilhas compradas e disparadores sem cadência.",
  },
  {
    question: "Preciso da API oficial do WhatsApp Business?",
    answer:
      "Não. Você conecta seu WhatsApp normalmente via QR Code, sem custo extra de API. Para volumes muito grandes ou regulados, também é possível plugar a API oficial — mas a maioria das PMEs começa direto pelo número da empresa.",
  },
  {
    question: "Qual a diferença para listas frias compradas?",
    answer:
      "Listas frias são desatualizadas, genéricas e geram bloqueio em poucos envios. O ZapScout busca empresas ativas no Google Maps no momento da campanha, com nome, telefone, endereço e categoria reais — leads quentes, segmentados e atualizados.",
  },
  {
    question: "Como funciona o follow-up automático?",
    answer:
      "Após o primeiro disparo, a IA monitora respostas e envia mensagens de retorno em horários otimizados para quem não respondeu. Você define o roteiro de 2, 3 ou 5 toques e o sistema executa sem que você precise lembrar.",
  },
  {
    question: "Posso personalizar as mensagens por lead?",
    answer:
      "Sim. Use variáveis como {{nome_empresa}}, {{cidade}}, {{segmento}} e {{bairro}} dentro do template. Cada lead recebe uma mensagem que parece escrita à mão, mantendo escala sem perder personalização.",
  },
  {
    question: "Quantas mensagens consigo disparar por dia?",
    answer:
      "Depende do aquecimento do número. Números novos começam com 30–50 envios/dia e escalam gradualmente até 300–500/dia. A própria plataforma sugere o ritmo seguro para o seu caso.",
  },
];

const config: LandingConfig = {
  currentPath: PATH,
  eyebrow: "📣 Disparo em massa inteligente",
  title: (
    <>
      Disparo em massa no{" "}
      <span style={{ background: "var(--gradient-zap)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
        WhatsApp
      </span>{" "}
      com leads quentes do mapa
    </>
  ),
  subtitle:
    "Pare de comprar listas frias. Encontre empresas reais no Google Maps por nicho e cidade, dispare mensagens personalizadas e deixe a IA fazer o follow-up — com cadência segura, sem bloqueio.",
  features: {
    title: "Por que funciona melhor que disparador comum",
    items: [
      { icon: MapPin, title: "Leads reais do Google Maps", description: "Empresas ativas, com telefone, endereço e categoria. Sem planilha vencida nem contato genérico." },
      { icon: Send, title: "Mensagens personalizadas", description: "Variáveis automáticas por lead: nome, cidade, segmento, bairro. Cada envio parece escrito à mão." },
      { icon: Gauge, title: "Cadência anti-bloqueio", description: "Intervalos randomizados, aquecimento progressivo e horários inteligentes para proteger seu número." },
      { icon: Shield, title: "Sem API paga", description: "Conecte seu WhatsApp via QR Code. Comece a disparar em 5 minutos, sem custo de API oficial." },
      { icon: Repeat, title: "Follow-up automático", description: "IA reativa leads frios com 2, 3 ou 5 toques em horários otimizados — sem você precisar lembrar." },
      { icon: Users, title: "Multicanal e multiusuário", description: "Vários SDRs no mesmo painel, distribuição automática de leads e histórico unificado por contato." },
    ],
  },
  steps: {
    title: "Como funciona o disparo em massa no ZapScout",
    items: [
      { title: "1. Busque no mapa", description: "Escolha o nicho (ex: clínicas, restaurantes, lojas) e a região onde quer prospectar. Exporte leads em segundos." },
      { title: "2. Crie a campanha", description: "Monte o template com variáveis automáticas e defina cadência, horários e número de follow-ups." },
      { title: "3. Dispare com IA", description: "O sistema envia em ritmo seguro, captura respostas e reativa leads frios — você só responde quem está interessado." },
    ],
  },
  bullets: {
    title: "O que você ganha com o ZapScout",
    items: [
      "Leads reais e atualizados do Google Maps — não lista vencida",
      "Mensagens personalizadas com nome, cidade e segmento da empresa",
      "Cadência inteligente que reduz risco de bloqueio do número",
      "Follow-up automático com IA, 2 a 5 toques por lead",
      "Painel multiusuário para times comerciais e SDRs",
      "Sem custo de API oficial — conecta via QR Code",
    ],
  },
  testimonials: {
    title: "Quem já trocou listas frias por leads do mapa",
    items: [
      {
        quote: "Trocamos planilha comprada por leads do ZapScout e a taxa de resposta saiu de 2% para 18% no primeiro mês.",
        author: "Rafael Lima",
        role: "Head Comercial, agência de marketing",
      },
      {
        quote: "Dispara 300 mensagens por dia personalizadas, sem bloqueio. O follow-up automático sozinho já paga a ferramenta.",
        author: "Camila Souza",
        role: "Fundadora, distribuidora B2B",
      },
    ],
  },
  faq: { items: FAQ_ITEMS },
  finalCta: {
    title: "Pare de comprar lista. Comece a prospectar de verdade.",
    subtitle: "Crie sua conta em 30 segundos. Sem cartão de crédito, sem fidelidade.",
    cta: { primary: { label: "Começar grátis", to: "/cadastro" } },
  },
};

export const Route = createFileRoute("/disparo-em-massa-whatsapp")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "disparo em massa whatsapp, envio em massa whatsapp, mensagens em massa whatsapp, prospecção whatsapp, disparador whatsapp, campanha whatsapp em massa, disparo whatsapp sem bloqueio, ferramenta disparo whatsapp",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "product" },
      { property: "og:url", content: `https://zapscout.com.br${PATH}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `https://zapscout.com.br${PATH}` }],
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
