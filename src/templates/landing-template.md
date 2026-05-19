# Landing Template — Snippet

Copie o bloco abaixo, salve como `src/routes/<sua-rota>.tsx` (ex.: `src/routes/para.contabilidade.tsx`), e edite os campos marcados com `← editar`.

## Checklist rápido

1. ✏️ Trocar `PATH`, `TITLE`, `DESCRIPTION` no topo do arquivo
2. ✏️ Trocar o caminho em `createFileRoute("...")` (igual ao `PATH`)
3. ✏️ Editar `config` (hero, features, steps, faq, etc.) — qualquer seção é opcional, apague o que não usar
4. ➕ Adicionar entrada em `src/content/site-graph.ts` → vira link automático no sitemap, no footer e nos RelatedLinks de páginas relacionadas

## Seções disponíveis no template

| Seção        | Quando usar                                      |
|--------------|--------------------------------------------------|
| `eyebrow`    | Tag curta acima do título (emoji + 2-4 palavras) |
| `title`      | H1 com destaque colorido em uma palavra          |
| `subtitle`   | Subtítulo descritivo de 1-2 linhas               |
| `cta`        | Botões primário + secundário no hero             |
| `features`   | Grid 3 colunas com ícone + título + descrição    |
| `steps`      | Passo a passo numerado (Como funciona)           |
| `bullets`    | Lista de diferenciais com checks                 |
| `testimonials` | Citações de clientes (2 colunas)               |
| `faq`        | Acordeão de Q&A — gera JSON-LD `FAQPage` também  |
| `finalCta`   | Banner roxo de conversão no fim da página        |
| RelatedLinks | Auto: 3 páginas relacionadas (apagar `showRelated: false` para esconder) |
| SiteFooter   | Auto: mega-footer com nichos/recursos/app        |

## Snippet completo (copie tudo abaixo)

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Map, Send, ShieldCheck } from "lucide-react";
import {
  LandingTemplate,
  type LandingConfig,
  faqJsonLd,
  breadcrumbJsonLd,
} from "@/components/landing-template";

// ← editar ─────────────────────────────────────────────────────────────────
const PATH = "/exemplo";
const TITLE = "Título da página — ZapScout";
const DESCRIPTION = "Descrição de até 160 caracteres explicando o que essa página oferece.";

const FAQ_ITEMS = [
  { question: "Pergunta 1?", answer: "Resposta curta e objetiva." },
  { question: "Pergunta 2?", answer: "Resposta curta e objetiva." },
  { question: "Pergunta 3?", answer: "Resposta curta e objetiva." },
];

const config: LandingConfig = {
  currentPath: PATH,

  // HERO
  eyebrow: "✨ Tag curta acima do título",
  title: (
    <>
      Frase de impacto com{" "}
      <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
        destaque
      </span>
    </>
  ),
  subtitle: "Uma linha explicando o benefício principal, para quem é, e qual problema resolve.",
  cta: {
    primary: { label: "Começar grátis", to: "/cadastro" },
    secondary: { label: "Entrar", to: "/login" },
  },

  // FEATURES — grid 3 colunas com ícone
  features: {
    title: "O que você ganha",
    items: [
      { icon: Map, title: "Recurso 1", description: "Descrição curta do recurso 1." },
      { icon: Send, title: "Recurso 2", description: "Descrição curta do recurso 2." },
      { icon: ShieldCheck, title: "Recurso 3", description: "Descrição curta do recurso 3." },
    ],
  },

  // STEPS — numerado
  steps: {
    title: "Como funciona",
    items: [
      { title: "Passo 1", description: "Explicação do primeiro passo." },
      { title: "Passo 2", description: "Explicação do segundo passo." },
      { title: "Passo 3", description: "Explicação do terceiro passo." },
    ],
  },

  // BULLETS — lista com checks
  bullets: {
    title: "Por que escolher",
    items: [
      "Diferencial 1 — específico e mensurável",
      "Diferencial 2 — específico e mensurável",
      "Diferencial 3 — específico e mensurável",
    ],
  },

  // TESTIMONIALS
  testimonials: {
    title: "Resultados reais",
    items: [
      { quote: "Frase impactante de um cliente.", author: "Nome", role: "Cargo, Empresa" },
      { quote: "Outra frase impactante.", author: "Nome 2", role: "Cargo, Empresa" },
    ],
  },

  // FAQ — também gera JSON-LD abaixo
  faq: { items: FAQ_ITEMS },

  // FINAL CTA
  finalCta: {
    title: "Pronto para começar?",
    subtitle: "Crie sua conta em 30 segundos. Sem cartão de crédito.",
    cta: { primary: { label: "Começar grátis", to: "/cadastro" } },
  },
};
// ← fim editar ────────────────────────────────────────────────────────────

export const Route = createFileRoute("/exemplo")({ // ← trocar o path aqui também
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
```

## Snippet mínimo (landing curta sem FAQ/steps)

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { LandingTemplate } from "@/components/landing-template";

export const Route = createFileRoute("/minha-rota")({
  head: () => ({
    meta: [
      { title: "Título — ZapScout" },
      { name: "description", content: "Descrição." },
      { property: "og:url", content: "/minha-rota" },
    ],
    links: [{ rel: "canonical", href: "/minha-rota" }],
  }),
  component: () => (
    <LandingTemplate
      currentPath="/minha-rota"
      eyebrow="✨ Tag"
      title="Título"
      subtitle="Subtítulo."
      features={{
        items: [
          { title: "A", description: "..." },
          { title: "B", description: "..." },
          { title: "C", description: "..." },
        ],
      }}
      finalCta={{
        title: "Pronto?",
        cta: { primary: { label: "Começar", to: "/cadastro" } },
      }}
    />
  ),
});
```

## Entrada no site graph

Depois de criar a rota, registre-a em `src/content/site-graph.ts`:

```ts
{
  path: "/minha-rota",
  title: "Título — ZapScout",
  short: "Minha rota",
  description: "Teaser de 1 linha.",
  kind: "niche",        // ou "feature" | "blog" | "landing"
  intent: "mofu",       // tofu (topo) | mofu (meio) | bofu (fundo)
  topics: ["whatsapp", "prospeccao"],  // tags para escolher páginas relacionadas
  priority: "0.8",
  changefreq: "monthly",
},
```
