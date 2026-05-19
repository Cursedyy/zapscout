import { createFileRoute } from "@tanstack/react-router";
import { Map, MessageSquare, Bot, Scale, ShieldCheck, Briefcase } from "lucide-react";
import { LandingTemplate, faqJsonLd, breadcrumbJsonLd, type LandingConfig } from "@/components/landing-template";

const PATH = "/para/advocacia";
const TITLE = "Prospecção para Advocacia: Capte Clientes pelo WhatsApp | ZapScout";
const DESCRIPTION =
  "Captação de clientes para escritórios de advocacia: encontre empresas por região, aborde decisores no WhatsApp e automatize o follow-up — dentro dos limites éticos da OAB.";

// Palavras-chave alvo: "captação de clientes advocacia", "prospecção para advogados",
// "marketing jurídico", "clientes para escritório de advocacia", "advocacia empresarial",
// "como conseguir clientes advogado", "advogado prospecção whatsapp".

const FAQ_ITEMS = [
  {
    question: "Advogado pode prospectar clientes pelo WhatsApp?",
    answer:
      "Sim, dentro dos limites do Provimento 205/2021 da OAB. É permitido oferecer informação jurídica relevante, conteúdo educativo e apresentar o escritório de forma sóbria — sem mercantilização, sem promessa de resultado e sem captação predatória. O ZapScout entrega templates já adequados a essa linha.",
  },
  {
    question: "Como funciona a captação de clientes para advocacia no ZapScout?",
    answer:
      "Você escolhe a região (cidade ou bairro) e o segmento de empresas que costuma virar cliente do escritório — comércio, indústria, construção civil, saúde, e-commerce. O ZapScout busca essas empresas no Google Maps, traz os contatos e dispara uma mensagem de apresentação institucional pelo seu WhatsApp.",
  },
  {
    question: "Quais áreas do direito mais se beneficiam?",
    answer:
      "Advocacia trabalhista, tributária, empresarial, recuperação judicial, regulatória, imobiliária e LGPD são as que têm melhor retorno, porque o cliente-alvo é PJ identificável no mapa. Para áreas cíveis e familiares, indicamos focar em prospecção indireta via parceiros.",
  },
  {
    question: "Preciso de uma lista de empresas pronta?",
    answer:
      "Não. O sistema busca empresas ativas em tempo real no Google Maps a partir do nicho e cidade que você escolher. Sem planilha vencida, sem comprar mailing.",
  },
  {
    question: "É ético usar disparo em massa na advocacia?",
    answer:
      "Disparo bruto e genérico não é ético. Por isso o ZapScout funciona com mensagens personalizadas, cadência controlada, conteúdo informativo e direcionamento por segmento — formato compatível com o Código de Ética e Disciplina da OAB.",
  },
  {
    question: "Como o follow-up automático ajuda o escritório?",
    answer:
      "A maior parte dos prospects PJ responde no 2º ou 3º contato. A IA do ZapScout reativa quem não respondeu com mensagens informativas em horários comerciais, e devolve à sua agenda só os leads que demonstram interesse real.",
  },
  {
    question: "Quanto tempo leva para ver resultado?",
    answer:
      "Escritórios que disparam 100–200 mensagens segmentadas por semana costumam fechar as primeiras reuniões em 7–14 dias. O ROI consistente aparece a partir do segundo mês, quando o follow-up automático começa a maturar a base.",
  },
];

const config: LandingConfig = {
  currentPath: PATH,
  eyebrow: "⚖️ Para escritórios de advocacia",
  title: (
    <>
      Capte clientes jurídicos por{" "}
      <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
        região e segmento
      </span>
    </>
  ),
  subtitle:
    "Encontre empresas e profissionais autônomos na sua cidade, abra conversas no WhatsApp com tom adequado à OAB e deixe a IA cuidar do follow-up. Captação ativa, sem listas frias e dentro da ética profissional.",
  features: {
    title: "Feito para escritórios que querem crescer com método",
    items: [
      { icon: Map, title: "Empresas por segmento", description: "Filtre comércios, indústrias, construtoras, clínicas e e-commerces que mais precisam de assessoria trabalhista, tributária ou empresarial." },
      { icon: MessageSquare, title: "Abordagem ética e profissional", description: "Templates com tom institucional, conteúdo informativo e variáveis automáticas — compatíveis com o Provimento 205 da OAB." },
      { icon: Bot, title: "Follow-up com IA", description: "Reativa leads frios em horários comerciais e devolve à sua agenda apenas quem demonstra interesse real." },
      { icon: Scale, title: "Áreas com maior retorno", description: "Trabalhista, tributária, empresarial, recuperação judicial, regulatória, imobiliária e LGPD — onde o cliente-alvo é PJ identificável." },
      { icon: ShieldCheck, title: "Cadência segura", description: "Intervalos randomizados e aquecimento do número evitam bloqueio do WhatsApp do escritório." },
      { icon: Briefcase, title: "Pipeline organizado", description: "Cada lead vira um card com histórico, próximos passos e responsável — pronto para o sócio ou paralegal assumir." },
    ],
  },
  steps: {
    title: "Como funciona a prospecção jurídica no ZapScout",
    items: [
      { title: "1. Escolha a região", description: "Selecione estado, cidade e bairro onde o escritório quer atuar. Foco geográfico aumenta taxa de fechamento." },
      { title: "2. Filtre o segmento", description: "Escolha o tipo de empresa-alvo: indústria, comércio, construção, saúde, tecnologia. Só PJ qualificado entra na campanha." },
      { title: "3. Abra a conversa", description: "Dispare a primeira mensagem institucional. A IA acompanha respostas, faz follow-up e devolve leads quentes para você." },
    ],
  },
  bullets: {
    title: "O que muda no seu escritório",
    items: [
      "Captação ativa de clientes PJ sem depender de indicação",
      "Mensagens dentro do Código de Ética da OAB",
      "Foco em áreas com melhor ticket: trabalhista, tributária, empresarial",
      "Follow-up automático que maturação leads em 14–30 dias",
      "Pipeline organizado por responsável e estágio",
      "Substitui custo de mídia paga e listas compradas",
    ],
  },
  testimonials: {
    title: "Escritórios que já estão captando com ZapScout",
    items: [
      {
        quote: "Em 6 semanas fechamos 4 contratos de assessoria trabalhista recorrente com empresas que nunca tinham ouvido falar do escritório.",
        author: "Dr. Eduardo Martins",
        role: "Sócio, advocacia empresarial",
      },
      {
        quote: "A abordagem é discreta e o follow-up faz o trabalho que nenhum estagiário consegue manter. Mudou nosso comercial.",
        author: "Dra. Patrícia Reis",
        role: "Sócia, advocacia tributária",
      },
    ],
  },
  faq: { items: FAQ_ITEMS },
  finalCta: {
    title: "Pronto para captar clientes jurídicos com método?",
    subtitle: "Sem listas frias, sem cartão de crédito, sem fidelidade.",
    cta: { primary: { label: "Começar grátis", to: "/cadastro" } },
  },
};

export const Route = createFileRoute("/para/advocacia")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "captação de clientes advocacia, prospecção para advogados, marketing jurídico, clientes para escritório de advocacia, advocacia empresarial, como conseguir clientes advogado, prospecção whatsapp advocacia",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "product" },
      { property: "og:url", content: PATH },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PATH }],
    scripts: [
      faqJsonLd(FAQ_ITEMS),
      breadcrumbJsonLd([
        { name: "Home", item: "/" },
        { name: "Para Advocacia", item: PATH },
      ]),
    ],
  }),
  component: () => <LandingTemplate {...config} />,
});
