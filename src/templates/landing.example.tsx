// ─────────────────────────────────────────────────────────────────────────
// LANDING TEMPLATE — copy-paste starter for new pages.
//
// HOW TO USE:
// 1. Copy this file to src/routes/<sua-rota>.tsx (ex: src/routes/para.contabilidade.tsx)
// 2. Trocar o path em createFileRoute("/...") e em currentPath
// 3. Editar head() (title, description, og, canonical)
// 4. Editar config (hero, features, steps, faq, etc.)
// 5. Adicionar entry em src/content/site-graph.ts → vira link automático em sitemap, footer e RelatedLinks
//
// Toda seção é opcional — apague o que não usar.
// ─────────────────────────────────────────────────────────────────────────

import { createFileRoute } from "@tanstack/react-router";
import { Map, Send, ShieldCheck, Sparkles } from "lucide-react";
import {
  LandingTemplate,
  type LandingConfig,
  faqJsonLd,
  breadcrumbJsonLd,
} from "@/components/landing-template";

const PATH = "/exemplo"; // ← trocar
const TITLE = "Título da página — ZapScout";
const DESCRIPTION = "Descrição de até 160 caracteres explicando o que essa página oferece.";

const config: LandingConfig = {
  currentPath: PATH,

  // HERO ------------------------------------------------------------------
  eyebrow: "✨ Tag curta acima do título",
  title: (
    <>
      Frase de impacto com{" "}
      <span
        style={{
          background: "var(--gradient-primary)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        destaque
      </span>
    </>
  ),
  subtitle:
    "Uma linha explicando o benefício principal, para quem é, e qual problema resolve.",
  cta: {
    primary: { label: "Começar grátis", to: "/cadastro" },
    secondary: { label: "Entrar", to: "/login" },
  },

  // FEATURES (grid 3 colunas) --------------------------------------------
  features: {
    title: "O que você ganha",
    items: [
      { icon: Map, title: "Recurso 1", description: "Descrição curta do recurso 1." },
      { icon: Send, title: "Recurso 2", description: "Descrição curta do recurso 2." },
      { icon: ShieldCheck, title: "Recurso 3", description: "Descrição curta do recurso 3." },
    ],
  },

  // STEPS (numerado) ------------------------------------------------------
  steps: {
    title: "Como funciona",
    items: [
      { title: "Passo 1", description: "Explicação do primeiro passo." },
      { title: "Passo 2", description: "Explicação do segundo passo." },
      { title: "Passo 3", description: "Explicação do terceiro passo." },
    ],
  },

  // BULLETS (lista com checks) -------------------------------------------
  bullets: {
    title: "Por que escolher",
    items: [
      "Diferencial 1 — específico e mensurável",
      "Diferencial 2 — específico e mensurável",
      "Diferencial 3 — específico e mensurável",
    ],
  },

  // TESTIMONIALS ---------------------------------------------------------
  testimonials: {
    title: "Resultados reais",
    items: [
      { quote: "Frase impactante de um cliente.", author: "Nome", role: "Cargo, Empresa" },
      { quote: "Outra frase impactante.", author: "Nome 2", role: "Cargo, Empresa" },
    ],
  },

  // FAQ (também vira JSON-LD abaixo) -------------------------------------
  faq: {
    items: FAQ_ITEMS, // ← definido abaixo para reaproveitar no JSON-LD
  },

  // FINAL CTA ------------------------------------------------------------
  finalCta: {
    title: "Pronto para começar?",
    subtitle: "Crie sua conta em 30 segundos. Sem cartão de crédito.",
    cta: { primary: { label: "Começar grátis", to: "/cadastro" } },
  },
};

const FAQ_ITEMS = [
  { question: "Pergunta 1?", answer: "Resposta curta e objetiva." },
  { question: "Pergunta 2?", answer: "Resposta curta e objetiva." },
  { question: "Pergunta 3?", answer: "Resposta curta e objetiva." },
];

// Atribuição feita após a declaração para evitar TDZ (FAQ_ITEMS é hoisted como const).
config.faq = { items: FAQ_ITEMS };

export const Route = createFileRoute(PATH)({
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
        { name: TITLE, item: PATH },
      ]),
    ],
  }),
  component: () => <LandingTemplate {...config} />,
});
