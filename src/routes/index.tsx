import { createFileRoute, Link } from "@tanstack/react-router";

import {
  Compass,
  Send,
  Users,
  MessageCircle,
  ChevronRight,
  ArrowUpRight,
  Search,
  Zap,
  Map as MapIcon,
  Sparkles,
  Filter,
  Download,
  Star,
  ShieldCheck,
  Check,
  TrendingUp,
  Timer,
  Quote,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZapScout — Ferramenta de prospecção no WhatsApp" },
      {
        name: "description",
        content:
          "ZapScout é a ferramenta que encontra empresas no Google Maps, dispara mensagens no WhatsApp e organiza seu CRM em um único painel.",
      },
      { property: "og:title", content: "ZapScout — Ferramenta de prospecção no WhatsApp" },
      {
        property: "og:description",
        content: "Painel de prospecção: mapa, disparo no WhatsApp e CRM em um lugar só.",
      },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "ZapScout",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div
      className="min-h-dvh w-full flex flex-col items-center p-3 md:p-6 gap-8 md:gap-12 pb-24 md:pb-6"
      style={{ background: "var(--color-bg-base)", fontFamily: "var(--font-sans)" }}
    >
      {/* Urgency banner */}
      <div
        className="w-full max-w-[1100px] -mb-4 mt-1 rounded-full border px-4 py-2 text-[11px] md:text-xs flex items-center justify-center gap-2 text-center"
        style={{
          borderColor: "var(--color-border)",
          background: "linear-gradient(90deg, rgba(79,70,229,0.15), rgba(129,140,248,0.08), rgba(79,70,229,0.15))",
          color: "var(--color-text-secondary)",
        }}
      >
        <Timer className="w-3.5 h-3.5" style={{ color: "var(--color-primary-light)" }} />
        <span>
          <span className="text-white font-semibold">Oferta de lançamento:</span>{" "}
          50% OFF no primeiro mês do Pro · termina em <span className="font-mono text-white">48h</span>
        </span>
      </div>

      {/* Hero */}
      <section className="w-full max-w-[1100px] pt-10 md:pt-20 pb-2 md:pb-6 text-center px-2">

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
          />
          Prospecção ativa · Disparo no WhatsApp · IA de vendas
        </div>
        <h1
          className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-white leading-[1.05]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Prospecte clientes no <span style={{ color: "var(--color-primary-light)" }}>WhatsApp</span>
          <br className="hidden sm:block" /> direto do mapa do Brasil.
        </h1>
        <p
          className="mt-5 md:mt-7 text-base md:text-xl max-w-[720px] mx-auto leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Encontra empresas no Google Maps, dispara mensagens no WhatsApp e organiza tudo num CRM.
          Pare de pagar tráfego: vá direto onde seus clientes já estão.
        </p>
        <div className="mt-8 md:mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link
            to="/cadastro"
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
            style={{
              background: "var(--color-primary)",
              boxShadow: "0 14px 40px -10px var(--color-primary)",
            }}
          >
            Criar conta grátis <ArrowUpRight className="w-4 h-4" />
          </Link>
          <Link
            to="/login"
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-semibold text-sm border inline-flex items-center justify-center gap-2 text-white hover:bg-white/5 transition-colors"
            style={{ borderColor: "var(--color-border)" }}
          >
            Entrar
          </Link>
        </div>
        <p className="mt-4 text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
          20 buscas grátis por mês · sem cartão de crédito
        </p>

        {/* Social proof strip */}
        <div className="mt-10 flex flex-col items-center gap-4">
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>
            <div className="flex -space-x-2">
              {["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f472b6"].map((c, i) => (
                <div
                  key={i}
                  className="w-7 h-7 rounded-full border-2"
                  style={{
                    background: `linear-gradient(135deg, ${c}, var(--color-primary-dark))`,
                    borderColor: "var(--color-bg-base)",
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              ))}
              <span className="ml-1.5 text-white font-semibold">4.9/5</span>
              <span className="hidden sm:inline">· +2.300 empresas prospectando agora</span>
            </div>
          </div>

          {/* Live activity ticker */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-mono"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-bg-card)",
              color: "var(--color-text-secondary)",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--color-zap)" }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--color-zap)" }} />
            </span>
            <span className="text-white">Marcos</span> de Curitiba acabou de capturar <span className="text-white">142 leads</span>
          </div>
        </div>

        {/* Inline stats counters */}
        <div className="mt-10 grid grid-cols-3 gap-3 md:gap-6 max-w-[640px] mx-auto">
          {[
            { v: "2.3M+", l: "Leads capturados" },
            { v: "48%", l: "Taxa de resposta" },
            { v: "R$ 0,14", l: "Custo por lead" },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <div
                className="text-2xl md:text-4xl font-bold text-white tabular-nums"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {s.v}
              </div>
              <div className="text-[10px] md:text-xs mt-1 uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </section>


      {/* Workspace preview (screenshot-like) */}
      <div
        className="w-full max-w-[1440px] flex flex-col rounded-2xl overflow-hidden border"
        style={{
          background: "var(--color-bg-base)",
          borderColor: "var(--color-border)",
          boxShadow: "var(--shadow-glow)",
          minHeight: "min(850px, calc(100dvh - 24px))",
        }}
      >
        {/* Auth strip — discreet top bar with sign-in actions */}
        <div
          className="flex items-center justify-between px-4 md:px-6 h-10 border-b text-[11px]"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          <div className="flex items-center gap-2 font-mono">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--color-zap)", boxShadow: "0 0 8px var(--color-zap)" }}
            />
            zapscout.app · v1.4.2 · workspace preview
          </div>
          <div className="flex items-center gap-1">
            <Link
              to="/login"
              className="px-3 py-1 rounded-md hover:text-white transition-colors"
            >
              Entrar
            </Link>
            <Link
              to="/cadastro"
              className="px-3 py-1 rounded-md text-white font-medium text-[11px]"
              style={{ background: "var(--color-primary)" }}
            >
              Criar conta
            </Link>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <aside
            className="hidden md:flex w-64 border-r flex-col"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg-base)" }}
          >
            <div className="p-5 flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: "var(--gradient-primary, var(--color-primary))",
                  boxShadow: "0 6px 18px -6px var(--color-primary)",
                }}
              >
                <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <span
                className="font-bold tracking-tight text-xl text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                ZapScout
              </span>
            </div>


            <nav className="flex-1 px-3 space-y-1 mt-3">
              <SideItem icon={<Compass className="w-4 h-4" />} label="Prospector" active />
              <SideItem icon={<Send className="w-4 h-4" />} label="Campanhas" />
              <SideItem icon={<MessageCircle className="w-4 h-4" />} label="WhatsApp" />
              <SideItem icon={<Users className="w-4 h-4" />} label="CRM Leads" />
              <SideItem icon={<Sparkles className="w-4 h-4" />} label="IA Assistente" />

              <div
                className="text-[10px] font-bold uppercase tracking-widest px-3 pt-6 pb-2"
                style={{ color: "var(--color-text-muted)" }}
              >
                Workspace
              </div>
              <SideItem icon={<MapIcon className="w-4 h-4" />} label="Mapa do Brasil" />
              <SideItem icon={<Filter className="w-4 h-4" />} label="Templates" />
              <SideItem icon={<Download className="w-4 h-4" />} label="Relatórios" />
            </nav>

            <div className="p-3 border-t" style={{ borderColor: "var(--color-border)" }}>
              <div
                className="p-3 rounded-xl border"
                style={{ background: "var(--color-bg-card)", borderColor: "var(--color-border)" }}
              >
                <div className="flex justify-between items-center mb-2">
                  <span
                    className="text-[10px] uppercase tracking-widest font-bold"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Plano Free
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--color-primary-light)" }}>
                    67%
                  </span>
                </div>
                <div
                  className="w-full h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--color-bg-base)" }}
                >
                  <div
                    className="h-full"
                    style={{ width: "67%", background: "var(--color-primary)" }}
                  />
                </div>
                <Link
                  to="/planos"
                  className="block mt-3 text-[11px] font-medium text-center py-1.5 rounded-md text-white"
                  style={{ background: "var(--color-primary-dark)" }}
                >
                  Fazer upgrade
                </Link>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Topbar */}
            <header
              className="h-14 border-b flex items-center justify-between px-4 md:px-6"
              style={{
                borderColor: "var(--color-border)",
                background: "rgba(10,10,26,0.6)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div
                className="flex items-center gap-2 text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <span className="hidden sm:inline">Workspace</span>
                <ChevronRight className="w-3 h-3 hidden sm:inline" />
                <span className="text-white font-medium">Prospector</span>
                <span
                  className="ml-3 hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[10px]"
                  style={{
                    background: "var(--color-bg-card)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--color-zap)" }}
                  />
                  WhatsApp conectado
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/app"
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition-colors inline-flex items-center gap-1.5"
                  style={{
                    background: "var(--color-primary)",
                    boxShadow: "0 8px 24px -8px var(--color-primary)",
                  }}
                >
                  + Nova busca
                </Link>
                <div
                  className="w-8 h-8 rounded-full border"
                  style={{
                    background: "linear-gradient(135deg, var(--color-bg-elevated), var(--color-primary))",
                    borderColor: "var(--color-primary)",
                  }}
                />
              </div>
            </header>

            {/* Body */}
            <main className="flex-1 p-4 md:p-6 flex flex-col gap-5 overflow-auto">
              {/* KPI row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="Leads capturados" value="2.842" delta="+12% vs ontem" tone="up" />
                <Kpi label="Taxa de abertura" value="48.2%" delta="Meta: 40%" tone="up" />
                <Kpi label="Mensagens disparadas" value="14.029" delta="últimos 30d" />
                <Kpi label="Custo por lead" value="R$ 0,14" delta="-23% vs média" tone="up" />
              </div>

              {/* Workspace panels */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
                {/* Filters */}
                <section
                  className="lg:col-span-4 rounded-xl border flex flex-col overflow-hidden"
                  style={{
                    background: "var(--color-bg-card)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <div
                    className="p-4 border-b"
                    style={{
                      borderColor: "var(--color-border)",
                      background: "rgba(30,30,90,0.25)",
                    }}
                  >
                    <h2
                      className="text-sm font-bold text-white uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Filtros de prospecção
                    </h2>
                  </div>

                  <div className="p-5 space-y-4">
                    <Field label="Nicho / palavra-chave">
                      <div className="relative">
                        <span
                          aria-hidden
                          className="absolute left-2 top-1/2 -translate-y-1/2 grid place-items-center h-6 w-6 rounded-md bg-gradient-primary shadow-glow"
                        >
                          <Zap className="h-3.5 w-3.5 text-primary-foreground" />
                        </span>
                        <input
                          type="text"
                          placeholder="Ex: academias, restaurantes…"
                          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none border focus:border-primary"
                          style={{
                            background: "var(--color-bg-base)",
                            borderColor: "var(--color-border)",
                            color: "var(--color-text-primary)",
                          }}
                        />
                      </div>
                    </Field>

                    <Field label="Localização (Google Maps)">
                      <input
                        type="text"
                        placeholder="Ex: Jardins, São Paulo"
                        className="w-full px-3 py-2 text-sm rounded-lg outline-none border"
                        style={{
                          background: "var(--color-bg-base)",
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Raio (km)">
                        <select
                          className="w-full px-2 py-2 text-sm rounded-lg border"
                          style={{
                            background: "var(--color-bg-base)",
                            borderColor: "var(--color-border)",
                            color: "var(--color-text-primary)",
                          }}
                        >
                          <option>5 km</option>
                          <option>10 km</option>
                          <option>25 km</option>
                        </select>
                      </Field>
                      <Field label="Mín. avaliação">
                        <select
                          className="w-full px-2 py-2 text-sm rounded-lg border"
                          style={{
                            background: "var(--color-bg-base)",
                            borderColor: "var(--color-border)",
                            color: "var(--color-text-primary)",
                          }}
                        >
                          <option>4.0+</option>
                          <option>3.0+</option>
                          <option>Qualquer</option>
                        </select>
                      </Field>
                    </div>

                    <Link
                      to="/cadastro"
                      className="block w-full text-center py-3 text-sm font-bold rounded-xl mt-2 text-white"
                      style={{
                        background: "var(--color-primary)",
                        boxShadow: "0 10px 30px -10px var(--color-primary)",
                      }}
                    >
                      Iniciar escaneamento
                    </Link>
                    <p
                      className="text-[11px] text-center font-mono"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Crie sua conta grátis para rodar buscas reais
                    </p>
                  </div>

                  <div
                    className="mt-auto p-3 border-t text-center"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <p className="text-[11px] font-mono" style={{ color: "var(--color-text-muted)" }}>
                      Dados em tempo real · Mapa do Brasil
                    </p>
                  </div>
                </section>

                {/* Leads table */}
                <section
                  className="lg:col-span-8 rounded-xl border flex flex-col overflow-hidden min-h-[360px]"
                  style={{
                    background: "var(--color-bg-card)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <div
                    className="p-4 border-b flex justify-between items-center"
                    style={{
                      borderColor: "var(--color-border)",
                      background: "rgba(30,30,90,0.25)",
                    }}
                  >
                    <h2
                      className="text-sm font-bold text-white uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Leads encontrados <span style={{ color: "var(--color-text-muted)" }}>· prévia</span>
                    </h2>
                    <div className="flex gap-2">
                      <button
                        className="text-[10px] font-bold px-2 py-1 rounded border inline-flex items-center gap-1"
                        style={{
                          borderColor: "var(--color-border)",
                          background: "var(--color-bg-base)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        <Filter className="w-3 h-3" /> Filtros
                      </button>
                      <button
                        className="text-[10px] font-bold px-2 py-1 rounded border inline-flex items-center gap-1"
                        style={{
                          borderColor: "var(--color-border)",
                          background: "var(--color-bg-base)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        <Download className="w-3 h-3" /> CSV
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr
                          className="text-[10px] uppercase border-b"
                          style={{
                            color: "var(--color-text-muted)",
                            borderColor: "var(--color-border)",
                          }}
                        >
                          <th className="px-4 py-3 font-semibold">Empresa</th>
                          <th className="px-4 py-3 font-semibold">Score</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold hidden md:table-cell">Telefone</th>
                          <th className="px-4 py-3 font-semibold text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody
                        className="text-sm divide-y"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {[
                          { empresa: "Smart Fit — Itaim", cidade: "São Paulo, SP", status: "Pronto" as const, tone: "success" as const, phone: "(11) 99827-XXXX", avaliacao: 4.6, reviews: 412 },
                          { empresa: "BlueFit Paulista", cidade: "São Paulo, SP", status: "Pendente" as const, tone: "warning" as const, phone: "(11) 97412-XXXX", disabled: true, avaliacao: 3.8, reviews: 128 },
                          { empresa: "Box 7 — Crossfit", cidade: "Pinheiros, SP", status: "Pronto" as const, tone: "success" as const, phone: "(11) 98221-XXXX", avaliacao: 4.9, reviews: 287 },
                          { empresa: "Studio Pilates Vila Nova", cidade: "São Paulo, SP", status: "Respondeu" as const, tone: "primary" as const, phone: "(11) 98012-XXXX", avaliacao: 4.4, reviews: 96 },
                          { empresa: "Academia Corpo & Mente", cidade: "Osasco, SP", status: "Pronto" as const, tone: "success" as const, phone: "(11) 99102-XXXX", avaliacao: 4.1, reviews: 54 },
                          { empresa: "Bodytech Faria Lima", cidade: "São Paulo, SP", status: "Novo" as const, tone: "muted" as const, phone: "(11) 97700-XXXX", avaliacao: 4.7, reviews: 1240 },
                        ]
                          .map((l) => ({ ...l, score: computeLeadScore(l.avaliacao, l.reviews, l.status) }))
                          .sort((a, b) => b.score - a.score)
                          .map((l) => (
                            <LeadRow
                              key={l.empresa}
                              empresa={l.empresa}
                              cidade={l.cidade}
                              status={l.status}
                              tone={l.tone}
                              phone={l.phone}
                              disabled={l.disabled}
                              score={l.score}
                            />
                          ))}
                      </tbody>
                    </table>
                  </div>

                  <div
                    className="p-3 border-t flex items-center justify-between text-[11px]"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    <span className="font-mono">6 de 2.842 leads · página 1</span>
                    <Link
                      to="/cadastro"
                      className="inline-flex items-center gap-1 font-semibold"
                      style={{ color: "var(--color-primary-light)" }}
                    >
                      Desbloquear todos <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                </section>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function SideItem({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      to="/cadastro"
      className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors"
      style={
        active
          ? {
              background: "var(--color-bg-card)",
              color: "#fff",
              border: "1px solid var(--color-border)",
            }
          : { color: "var(--color-text-secondary)" }
      }
    >
      <span className="opacity-80">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

function Kpi({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "up" | "down";
}) {
  const deltaColor =
    tone === "up"
      ? "var(--color-success)"
      : tone === "down"
        ? "var(--color-danger)"
        : "var(--color-text-muted)";
  return (
    <div
      className="p-4 rounded-xl border"
      style={{ background: "var(--color-bg-card)", borderColor: "var(--color-border)" }}
    >
      <p className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </p>
      <h3
        className="text-2xl font-bold text-white mt-1"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </h3>
      {delta && (
        <div className="text-[10px] mt-1 font-bold" style={{ color: deltaColor }}>
          {delta}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="text-[10px] font-bold uppercase tracking-wider block mb-1.5"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function computeLeadScore(avaliacao: number, reviews: number, status: string): number {
  const ratingPts = (avaliacao / 5) * 40;
  const reviewsPts = Math.min(reviews / 500, 1) * 30;
  const statusPts =
    status === "Pronto" ? 20 : status === "Respondeu" ? 10 : status === "Novo" ? 5 : 0;
  return Math.round(Math.max(0, Math.min(100, ratingPts + reviewsPts + statusPts)));
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#34d399" : score >= 40 ? "#fbbf24" : "#f87171";
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}80` }}
      />
      <span className="font-mono font-bold text-sm tabular-nums" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function LeadRow({
  empresa,
  cidade,
  status,
  tone,
  phone,
  disabled = false,
  score,
}: {
  empresa: string;
  cidade: string;
  status: string;
  tone: "success" | "warning" | "primary" | "muted";
  phone: string;
  disabled?: boolean;
  score: number;
}) {
  const toneMap: Record<string, { bg: string; fg: string; border: string }> = {
    success: {
      bg: "rgba(16,185,129,0.1)",
      fg: "#34d399",
      border: "rgba(16,185,129,0.25)",
    },
    warning: {
      bg: "rgba(245,158,11,0.1)",
      fg: "#fbbf24",
      border: "rgba(245,158,11,0.25)",
    },
    primary: {
      bg: "rgba(79,70,229,0.12)",
      fg: "#a5b4fc",
      border: "rgba(79,70,229,0.3)",
    },
    muted: {
      bg: "rgba(148,163,184,0.08)",
      fg: "#94a3b8",
      border: "rgba(148,163,184,0.2)",
    },
  };
  const t = toneMap[tone];

  return (
    <tr
      className="transition-colors"
      style={{ borderColor: "var(--color-border-subtle)" }}
    >
      <td className="px-4 py-3">
        <div className="font-medium text-white">{empresa}</div>
        <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
          {cidade}
        </div>
      </td>
      <td className="px-4 py-3">
        <ScoreBadge score={score} />
      </td>
      <td className="px-4 py-3">
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
          style={{ background: t.bg, color: t.fg, borderColor: t.border }}
        >
          {status}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs hidden md:table-cell" style={{ color: "var(--color-text-secondary)" }}>
        {phone}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to="/cadastro"
          className="text-xs font-bold"
          style={{
            color: disabled ? "var(--color-text-muted)" : "var(--color-primary-light)",
            pointerEvents: disabled ? "none" : "auto",
          }}
        >
          Disparar WhatsApp
        </Link>
      </td>
    </tr>
  );
}
