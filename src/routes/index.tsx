import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter } from "@/components/site-footer";
import { Preloader } from "@/components/preloader";
import {
  ArrowUpRight,
  Search,
  Send,
  MessageCircle,
  Users,
  Sparkles,
  Map as MapIcon,
  TrendingUp,
  ShieldCheck,
  Zap,
  Check,
  Star,
  Clock,
  Target,
  Quote,
  ChevronRight,
} from "lucide-react";

const SITE_URL = "https://zapscout.com.br";

const FAQ_ITEMS = [
  {
    q: "Como o ZapScout encontra clientes?",
    a: "Você escolhe um nicho (ex: academias) e uma cidade. Em segundos buscamos empresas reais no Google Maps com nome, telefone, endereço e nota — prontas pra prospecção.",
  },
  {
    q: "O disparo no WhatsApp é seguro pra meu número?",
    a: "Sim. Usamos cadência humana, aquecimento de chip, janelas de horário e intervalos aleatórios entre mensagens pra reduzir risco de bloqueio. Você ainda pode usar múltiplos chips em rotação.",
  },
  {
    q: "Preciso de cartão de crédito pra testar?",
    a: "Não. O plano Free libera 20 buscas e disparo limitado por mês, sem cartão. Só cobramos quando você decide subir pro Pro.",
  },
  {
    q: "Posso usar pra qualquer nicho?",
    a: "Sim. Hoje atendemos agências, advocacia, contabilidade, energia solar, corretoras de imóveis, seguros e dezenas de outros nichos B2B com presença no Google Maps.",
  },
  {
    q: "O ZapScout integra com meu WhatsApp pessoal ou Business?",
    a: "Funciona com qualquer número (pessoal, Business ou API oficial). Conectamos via QR Code ou sua própria API Key da UazAPI em menos de 1 minuto.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Cobrança mensal, sem fidelidade. Cancela em 1 clique direto no painel — seus leads e histórico continuam acessíveis.",
  },
];

const PLANS = [
  {
    nome: "Free",
    preco: "R$ 0",
    periodo: "/mês",
    desc: "Pra testar a prospecção antes de escalar",
    features: [
      "20 buscas no Google Maps/mês",
      "Disparo manual no WhatsApp",
      "CRM com kanban de leads",
      "1 usuário",
    ],
    cta: "Criar conta grátis",
    destaque: false,
  },
  {
    nome: "Pro",
    preco: "R$ 67",
    periodo: "/mês",
    desc: "Pra quem prospecta todo dia e quer escala",
    features: [
      "Buscas ilimitadas no Google Maps",
      "Disparo automático com cadência humana",
      "Aquecimento de chip multi-número",
      "Follow-ups automáticos + IA de respostas",
      "Sequências de mensagens prontas",
      "Suporte prioritário",
    ],
    cta: "Assinar Pro",
    destaque: true,
  },
  {
    nome: "Agência",
    preco: "R$ 197",
    periodo: "/mês",
    desc: "Pra agências gerenciando múltiplas operações",
    features: [
      "Tudo do Pro",
      "Múltiplos workspaces (clientes)",
      "Múltiplos chips em paralelo",
      "Relatórios white-label",
      "API e webhooks",
    ],
    cta: "Falar com vendas",
    destaque: false,
  },
];

const DEPOIMENTOS = [
  {
    nome: "Marcos Vinícius",
    cargo: "Sócio · Agência Trivela (Curitiba)",
    texto:
      "Em 30 dias trocamos R$ 4 mil de Ads por ZapScout. Capturamos 1.800 leads de academias e fechamos 7 contratos novos. O ROI ficou absurdo.",
    iniciais: "MV",
  },
  {
    nome: "Camila Resende",
    cargo: "Corretora · RE/MAX (São Paulo)",
    texto:
      "Antes eu prospectava no Instagram e demorava semanas. Hoje uso o ZapScout 20 min de manhã e meu dia já está cheio de conversas qualificadas no Zap.",
    iniciais: "CR",
  },
  {
    nome: "Daniel Costa",
    cargo: "CEO · SolarMaster (BH)",
    texto:
      "A automação de follow-up sozinha já paga a assinatura. Os leads esquentam sozinhos enquanto eu foco em fechar reunião com quem responde.",
    iniciais: "DC",
  },
  {
    nome: "Patrícia Almeida",
    cargo: "Contadora · Almeida Contábil (Porto Alegre)",
    texto:
      "Migrar pro ZapScout dobrou minha base de clientes em 4 meses. A segmentação por cidade e bairro é o que eu não encontrei em ferramenta nenhuma.",
    iniciais: "PA",
  },
];

const PROBLEMAS = [
  { stat: "73%", label: "do tempo do vendedor B2B vai pra prospectar — não pra vender" },
  { stat: "R$ 280", label: "é o custo médio de um lead qualificado no Meta/Google Ads em 2025" },
  { stat: "8 dias", label: "é o tempo médio pra prospectar 100 empresas manualmente no Google Maps" },
];

const FEATURES = [
  {
    icon: MapIcon,
    titulo: "Busca geolocalizada",
    desc: "Encontra empresas reais no Google Maps por nicho, cidade ou bairro. Filtro por nota, número de avaliações e categoria.",
  },
  {
    icon: Send,
    titulo: "Disparo no WhatsApp",
    desc: "Mensagens com variáveis, cadência humana e janelas de horário. Aquecimento de chip incluso pra evitar bloqueio.",
  },
  {
    icon: Sparkles,
    titulo: "IA de respostas",
    desc: "A IA responde leads automaticamente seguindo seu tom de voz, qualifica e marca reunião quando o lead aceita.",
  },
  {
    icon: Users,
    titulo: "CRM em kanban",
    desc: "Organize leads por etapa, marque follow-ups, adicione tags e exporte tudo pra planilha quando quiser.",
  },
  {
    icon: Clock,
    titulo: "Sequências e follow-ups",
    desc: "Crie cadências de 3 a 7 toques automáticos. Leads que não respondem entram em fila e são reativados sozinhos.",
  },
  {
    icon: ShieldCheck,
    titulo: "Conformidade & segurança",
    desc: "Dados em servidor brasileiro, em conformidade com LGPD. Você é dono dos leads — exporta quando quiser.",
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZapScout — Prospecção Automática via WhatsApp e Google Maps" },
      {
        name: "description",
        content:
          "Encontre clientes no Google Maps e dispare mensagens no WhatsApp automaticamente. Prospecção B2B inteligente para agências e consultores brasileiros.",
      },
      {
        name: "keywords",
        content:
          "prospecção automática, leads WhatsApp, Google Maps leads, prospecção B2B Brasil, ferramenta prospecção WhatsApp",
      },
      { property: "og:title", content: "ZapScout — Prospecção Automática via WhatsApp" },
      {
        property: "og:description",
        content:
          "Encontre clientes no Google Maps e dispare mensagens no WhatsApp automaticamente.",
      },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE_URL}/og-image.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "ZapScout — Prospecção Automática via WhatsApp" },
      {
        name: "twitter:description",
        content:
          "Encontre clientes no Google Maps e dispare mensagens no WhatsApp automaticamente.",
      },
      { name: "twitter:image", content: `${SITE_URL}/og-image.jpg` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "ZapScout",
          description:
            "Plataforma de prospecção automática via WhatsApp e Google Maps para agências brasileiras",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: SITE_URL,
          offers: {
            "@type": "Offer",
            price: "67.00",
            priceCurrency: "BRL",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.8",
            reviewCount: "127",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ_ITEMS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof window === "undefined") return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  return (
    <div
      className="min-h-dvh text-foreground"
      style={{ background: "var(--gradient-hero)", fontFamily: "var(--font-sans)" }}
    >
      <LandingHeader />
      <main id="main">
        <HeroSection />
        <ProblemaSection />
        <SolucaoSection />
        <FeaturesSection />
        <SocialProofSection />
        <PrecosSection />
        <FaqSection />
        <CtaFinalSection />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ============== HEADER ============== */

function LandingHeader() {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-xl"
      style={{
        background: "rgba(9,9,11,0.75)",
        borderColor: "var(--color-border-subtle)",
      }}
    >
      <div className="container mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
        <Link to="/" className="flex items-center gap-2" aria-label="ZapScout — página inicial">
          <div
            className="w-7 h-7 rounded-lg grid place-items-center"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-primary)" }}
          >
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span
            className="font-bold text-base tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
          >
            ZapScout
          </span>
        </Link>
        <nav className="flex items-center gap-1.5" aria-label="Ações principais">
          <a
            href="#precos"
            className="hidden sm:inline-flex px-3 py-2 text-sm rounded-lg hover:text-white transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Preços
          </a>
          <a
            href="#faq"
            className="hidden sm:inline-flex px-3 py-2 text-sm rounded-lg hover:text-white transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
          >
            FAQ
          </a>
          <Link
            to="/login"
            className="hidden sm:inline-flex px-3 py-2 text-sm rounded-lg text-white hover:bg-white/5 transition-colors"
          >
            Entrar
          </Link>
          <Link
            to="/cadastro"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-semibold text-white min-h-[40px]"
            style={{ background: "var(--color-primary)", boxShadow: "var(--shadow-primary)" }}
          >
            Começar grátis <ArrowUpRight className="w-4 h-4" aria-hidden />
          </Link>
        </nav>
      </div>
    </header>
  );
}

/* ============== 1. HERO ============== */

function HeroSection() {
  return (
    <section
      id="hero"
      className="container mx-auto px-4 sm:px-6 pt-12 md:pt-20 pb-16 text-center max-w-5xl"
      aria-labelledby="hero-title"
    >
      <div
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-6 text-[11px] font-mono"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-bg-card)",
          color: "var(--color-text-secondary)",
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--color-zap)", boxShadow: "0 0 8px var(--color-zap)" }}
          aria-hidden
        />
        +2.300 empresas prospectando agora · 4.8 ★
      </div>

      <h1
        id="hero-title"
        className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] text-white"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Encontre clientes no <span style={{ color: "var(--color-primary-light)" }}>WhatsApp</span>{" "}
        direto do mapa do Brasil.
      </h1>

      <p
        className="mt-6 text-base md:text-xl max-w-[680px] mx-auto leading-relaxed"
        style={{ color: "var(--color-text-secondary)" }}
      >
        ZapScout encontra empresas reais no Google Maps, dispara mensagens no WhatsApp
        automaticamente e organiza tudo num CRM. Pare de pagar tráfego — vá direto onde seus
        clientes já estão.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
        <Link
          to="/cadastro"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl text-white font-semibold text-base min-h-[52px] transition-transform hover:scale-[1.02]"
          style={{
            background: "var(--color-primary)",
            boxShadow: "0 14px 40px -10px var(--color-primary)",
          }}
        >
          Comece grátis hoje <ArrowUpRight className="w-4 h-4" aria-hidden />
        </Link>
        <a
          href="#solucao"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-semibold text-base border text-white hover:bg-white/5 min-h-[52px] transition-colors"
          style={{ borderColor: "var(--color-border)" }}
        >
          Ver como funciona
        </a>
      </div>
      <p className="mt-4 text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
        20 buscas grátis por mês · sem cartão de crédito · cancela em 1 clique
      </p>

      {/* Mockup ilustrativo */}
      <div
        className="mt-14 rounded-2xl border overflow-hidden mx-auto max-w-4xl"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--gradient-card)",
          boxShadow: "var(--shadow-glow)",
        }}
        aria-hidden
      >
        <div
          className="flex items-center gap-1.5 px-4 h-9 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          <span
            className="ml-3 text-[11px] font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            zapscout.com.br/app
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 sm:p-6">
          <MockKpi label="Leads capturados" value="2.842" trend="+12%" />
          <MockKpi label="Taxa de resposta" value="48,2%" trend="↑" />
          <MockKpi label="Custo por lead" value="R$ 0,14" trend="-23%" />
          <div
            className="col-span-1 md:col-span-3 rounded-xl border p-4 text-left"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg-base)" }}
          >
            <div className="flex items-center gap-2 mb-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
              <Search className="w-3.5 h-3.5" aria-hidden />
              <span>Resultados: academias em Curitiba · 142 empresas</span>
            </div>
            <div className="space-y-2">
              {[
                { n: "Smart Fit Batel", t: "+55 41 9 9999-1234", s: "4.6" },
                { n: "Bodytech Champagnat", t: "+55 41 9 8888-5678", s: "4.8" },
                { n: "Selfit Academia Centro", t: "+55 41 9 7777-9012", s: "4.5" },
              ].map((r) => (
                <div
                  key={r.n}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg"
                  style={{ background: "var(--color-bg-card)" }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{r.n}</div>
                    <div
                      className="text-[11px] font-mono truncate"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {r.t}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-white flex items-center gap-1">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" aria-hidden />
                      {r.s}
                    </span>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-md font-semibold"
                      style={{ background: "var(--color-zap)", color: "white" }}
                    >
                      Zap
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MockKpi({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div
      className="rounded-xl border p-4 text-left"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg-base)" }}
    >
      <div
        className="text-[10px] uppercase tracking-wider mb-1"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-bold text-white tabular-nums"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </div>
      <div className="text-[11px] mt-1" style={{ color: "var(--color-primary-light)" }}>
        {trend}
      </div>
    </div>
  );
}

/* ============== 2. PROBLEMA ============== */

function ProblemaSection() {
  return (
    <section
      id="problema"
      className="container mx-auto px-4 sm:px-6 py-16 md:py-24 max-w-5xl"
      aria-labelledby="problema-title"
    >
      <div className="text-center mb-12">
        <p
          className="text-xs font-mono uppercase tracking-widest mb-3"
          style={{ color: "var(--color-primary-light)" }}
        >
          O problema
        </p>
        <h2
          id="problema-title"
          className="text-3xl md:text-5xl font-bold text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Prospectar manualmente é <span style={{ color: "var(--color-danger)" }}>lento e caro</span>.
        </h2>
        <p
          className="mt-4 text-base md:text-lg max-w-2xl mx-auto"
          style={{ color: "var(--color-text-secondary)" }}
        >
          A maioria dos times comerciais perde semanas garimpando contato no Google Maps, copiando
          número um por um e pagando rios de dinheiro em Ads que não convertem.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PROBLEMAS.map((p) => (
          <div
            key={p.label}
            className="rounded-2xl border p-6 text-center"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg-card)" }}
          >
            <div
              className="text-4xl md:text-5xl font-bold mb-3"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--color-danger)",
              }}
            >
              {p.stat}
            </div>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {p.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== 3. SOLUÇÃO ============== */

const PASSOS = [
  {
    icon: Search,
    titulo: "1. Busque no mapa",
    desc: "Escolha o nicho e a cidade. Em segundos o ZapScout traz todas as empresas reais do Google Maps com nome, telefone, endereço e nota.",
  },
  {
    icon: Send,
    titulo: "2. Dispare no WhatsApp",
    desc: "Crie uma mensagem com variáveis ({{nome}}, {{cidade}}). O sistema dispara com cadência humana e janelas de horário pra não bloquear.",
  },
  {
    icon: TrendingUp,
    titulo: "3. Feche no automático",
    desc: "Follow-ups e IA de resposta esquentam o lead enquanto você dorme. Você só entra na conversa quando o lead já está pronto pra comprar.",
  },
];

function SolucaoSection() {
  return (
    <section
      id="solucao"
      className="container mx-auto px-4 sm:px-6 py-16 md:py-24 max-w-5xl"
      aria-labelledby="solucao-title"
    >
      <div className="text-center mb-12">
        <p
          className="text-xs font-mono uppercase tracking-widest mb-3"
          style={{ color: "var(--color-primary-light)" }}
        >
          A solução
        </p>
        <h2
          id="solucao-title"
          className="text-3xl md:text-5xl font-bold text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Em 3 passos do mapa pro WhatsApp.
        </h2>
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PASSOS.map((p) => (
          <li
            key={p.titulo}
            className="rounded-2xl border p-6 relative"
            style={{ borderColor: "var(--color-border)", background: "var(--gradient-card)" }}
          >
            <div
              className="w-12 h-12 rounded-xl grid place-items-center mb-4"
              style={{
                background: "var(--gradient-primary)",
                boxShadow: "var(--shadow-primary)",
              }}
            >
              <p.icon className="w-5 h-5 text-white" aria-hidden />
            </div>
            <h3
              className="text-lg font-bold text-white mb-2"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {p.titulo}
            </h3>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {p.desc}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ============== 4. FEATURES ============== */

function FeaturesSection() {
  return (
    <section
      id="features"
      className="container mx-auto px-4 sm:px-6 py-16 md:py-24 max-w-6xl"
      aria-labelledby="features-title"
    >
      <div className="text-center mb-12">
        <p
          className="text-xs font-mono uppercase tracking-widest mb-3"
          style={{ color: "var(--color-primary-light)" }}
        >
          Funcionalidades
        </p>
        <h2
          id="features-title"
          className="text-3xl md:text-5xl font-bold text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Tudo que você precisa pra prospectar como uma máquina.
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map((f) => (
          <article
            key={f.titulo}
            className="rounded-2xl border p-6"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg-card)" }}
          >
            <div
              className="w-11 h-11 rounded-xl grid place-items-center mb-4"
              style={{
                background: "var(--color-primary-glow)",
                color: "var(--color-primary-light)",
              }}
            >
              <f.icon className="w-5 h-5" aria-hidden />
            </div>
            <h3
              className="text-base font-bold text-white mb-2"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {f.titulo}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              {f.desc}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ============== 5. SOCIAL PROOF ============== */

function SocialProofSection() {
  return (
    <section
      id="depoimentos"
      className="container mx-auto px-4 sm:px-6 py-16 md:py-24 max-w-6xl"
      aria-labelledby="depoimentos-title"
    >
      <div className="text-center mb-12">
        <p
          className="text-xs font-mono uppercase tracking-widest mb-3"
          style={{ color: "var(--color-primary-light)" }}
        >
          Quem usa, recomenda
        </p>
        <h2
          id="depoimentos-title"
          className="text-3xl md:text-5xl font-bold text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          +2.300 empresas brasileiras já trocaram Ads por ZapScout.
        </h2>
        <div className="mt-5 flex items-center justify-center gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" aria-hidden />
          ))}
          <span className="text-white font-semibold ml-1">4.8/5</span>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            · 127 avaliações
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {DEPOIMENTOS.map((d) => (
          <figure
            key={d.nome}
            className="rounded-2xl border p-6"
            style={{ borderColor: "var(--color-border)", background: "var(--gradient-card)" }}
          >
            <Quote
              className="w-6 h-6 mb-3"
              style={{ color: "var(--color-primary-light)" }}
              aria-hidden
            />
            <blockquote
              className="text-base leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              "{d.texto}"
            </blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full grid place-items-center text-sm font-bold text-white shrink-0"
                style={{ background: "var(--gradient-primary)" }}
                aria-hidden
              >
                {d.iniciais}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{d.nome}</div>
                <div
                  className="text-xs truncate"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {d.cargo}
                </div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Faixa de logos placeholder */}
      <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 opacity-60">
        {["Trivela", "RE/MAX", "SolarMaster", "Almeida", "Loja+", "Studio7"].map((l) => (
          <div
            key={l}
            className="h-12 rounded-lg border grid place-items-center text-sm font-bold tracking-wider"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-bg-card)",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-display)",
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== 6. PREÇOS ============== */

function PrecosSection() {
  return (
    <section
      id="precos"
      className="container mx-auto px-4 sm:px-6 py-16 md:py-24 max-w-6xl"
      aria-labelledby="precos-title"
    >
      <div className="text-center mb-12">
        <p
          className="text-xs font-mono uppercase tracking-widest mb-3"
          style={{ color: "var(--color-primary-light)" }}
        >
          Planos
        </p>
        <h2
          id="precos-title"
          className="text-3xl md:text-5xl font-bold text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Comece grátis. Cresça quando quiser.
        </h2>
        <p className="mt-4 text-base" style={{ color: "var(--color-text-secondary)" }}>
          Sem fidelidade. Cancela em 1 clique. Sem cartão pra testar.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
        {PLANS.map((plan) => (
          <div
            key={plan.nome}
            className="rounded-2xl border p-7 flex flex-col relative"
            style={{
              borderColor: plan.destaque ? "var(--color-primary)" : "var(--color-border)",
              background: plan.destaque ? "var(--gradient-card)" : "var(--color-bg-card)",
              boxShadow: plan.destaque ? "var(--shadow-glow)" : "var(--shadow-card)",
            }}
          >
            {plan.destaque && (
              <span
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase text-white"
                style={{ background: "var(--gradient-primary)" }}
              >
                Mais popular
              </span>
            )}
            <h3
              className="text-xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {plan.nome}
            </h3>
            <p className="text-sm mt-1 mb-5" style={{ color: "var(--color-text-secondary)" }}>
              {plan.desc}
            </p>
            <div className="flex items-baseline gap-1 mb-6">
              <span
                className="text-4xl font-bold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {plan.preco}
              </span>
              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {plan.periodo}
              </span>
            </div>
            <ul className="space-y-2.5 mb-7 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check
                    className="w-4 h-4 mt-0.5 shrink-0"
                    style={{ color: "var(--color-zap)" }}
                    aria-hidden
                  />
                  <span style={{ color: "var(--color-text-secondary)" }}>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/cadastro"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm min-h-[44px] transition-transform hover:scale-[1.02]"
              style={
                plan.destaque
                  ? {
                      background: "var(--color-primary)",
                      color: "white",
                      boxShadow: "var(--shadow-primary)",
                    }
                  : {
                      background: "var(--color-bg-elevated)",
                      color: "white",
                      border: "1px solid var(--color-border)",
                    }
              }
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== 7. FAQ ============== */

function FaqSection() {
  return (
    <section
      id="faq"
      className="container mx-auto px-4 sm:px-6 py-16 md:py-24 max-w-3xl"
      aria-labelledby="faq-title"
    >
      <div className="text-center mb-10">
        <p
          className="text-xs font-mono uppercase tracking-widest mb-3"
          style={{ color: "var(--color-primary-light)" }}
        >
          FAQ
        </p>
        <h2
          id="faq-title"
          className="text-3xl md:text-5xl font-bold text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Perguntas frequentes.
        </h2>
      </div>

      <div className="space-y-3">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.q}
            className="group rounded-xl border p-5"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-bg-card)",
            }}
          >
            <summary className="font-semibold text-white flex items-center justify-between gap-4 cursor-pointer list-none">
              <span>{item.q}</span>
              <ChevronRight
                className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90"
                style={{ color: "var(--color-primary-light)" }}
                aria-hidden
              />
            </summary>
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ============== 8. CTA FINAL ============== */

function CtaFinalSection() {
  return (
    <section
      id="cta-final"
      className="container mx-auto px-4 sm:px-6 py-16 md:py-24 max-w-5xl"
      aria-labelledby="cta-title"
    >
      <div
        className="rounded-3xl p-10 md:p-14 text-center relative overflow-hidden"
        style={{
          background: "var(--gradient-primary)",
          boxShadow: "var(--shadow-glow)",
        }}
      >
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5 text-[11px] font-mono"
          style={{
            background: "rgba(255,255,255,0.15)",
            color: "white",
          }}
        >
          <Target className="w-3.5 h-3.5" aria-hidden /> Oferta de lançamento — termina em 48h
        </div>
        <h2
          id="cta-title"
          className="text-3xl md:text-5xl font-bold text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Comece grátis hoje. Capture 20 leads no Google Maps em 5 minutos.
        </h2>
        <p className="mt-4 text-white/90 max-w-2xl mx-auto">
          Sem cartão. Sem fidelidade. Em 1 minuto você está prospectando.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link
            to="/cadastro"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-semibold text-base min-h-[52px] transition-transform hover:scale-[1.02]"
            style={{
              background: "white",
              color: "var(--color-primary)",
            }}
          >
            Criar conta grátis <ArrowUpRight className="w-4 h-4" aria-hidden />
          </Link>
          <Link
            to="/planos"
            className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-4 rounded-xl font-semibold text-base text-white min-h-[52px] border-2 hover:bg-white/10 transition-colors"
            style={{ borderColor: "rgba(255,255,255,0.4)" }}
          >
            Ver planos
          </Link>
        </div>
      </div>
    </section>
  );
}
