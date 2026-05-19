import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Map, Sparkles, Send, ShieldCheck, ArrowRight, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZapScout — Prospecte. Conecte. Venda." },
      { name: "description", content: "Encontre clientes no mapa, fale no WhatsApp em segundos. Prospecção ativa com IA, mapa do Brasil e follow-ups automáticos." },
      { property: "og:title", content: "ZapScout — Prospecte. Conecte. Venda." },
      { property: "og:description", content: "Encontre clientes no mapa, fale no WhatsApp em segundos." },
    ],
  }),
  component: Landing,
});

function ZapScoutLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#8A47EA" fillOpacity="0.15" />
      <circle cx="16" cy="16" r="6" fill="#8A47EA" />
      <circle cx="16" cy="16" r="11" stroke="#8A47EA" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.5" />
    </svg>
  );
}

function Landing() {
  return (
    <div className="min-h-dvh text-foreground" style={{ background: "var(--gradient-hero)" }}>
      <header
        className="sticky top-0 z-20 border-b"
        style={{ background: "rgba(12,10,20,0.8)", backdropFilter: "blur(20px)", borderColor: "var(--color-border-subtle)" }}
      >
        <div className="container mx-auto flex items-center justify-between py-4 px-6">
          <div className="flex items-center gap-2.5">
            <span className="animate-logo-pulse rounded-full"><ZapScoutLogo /></span>
            <span className="font-display font-bold text-lg" style={{ color: "var(--color-primary-light)" }}>ZapScout</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost">Entrar</Button></Link>
            <Link to="/cadastro">
              <Button className="rounded-pill shadow-glow font-display" style={{ background: "var(--gradient-primary)" }}>
                Começar grátis
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="container mx-auto px-6 pt-20 pb-24 text-center max-w-4xl relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(rgba(168,124,240,0.18) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          }}
        />
        <div className="relative">
          <div
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-xs mb-6 hero-title"
            style={{
              background: "var(--color-primary-glow)",
              color: "var(--color-primary-light)",
              border: "1px solid rgba(138,71,234,0.3)",
            }}
          >
            <Sparkles className="h-3 w-3" /> 🚀 Prospecção inteligente
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] hero-title">
            Prospecte. Conecte.{" "}
            <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              Venda.
            </span>
          </h1>
          <p className="mt-6 text-lg max-w-2xl mx-auto hero-subtitle" style={{ color: "var(--color-text-secondary)" }}>
            Encontre clientes no mapa, fale no <span style={{ color: "var(--color-zap)" }}>WhatsApp</span> em segundos.
            O ZapScout busca empresas no Google Maps e dispara mensagens personalizadas com follow-ups automáticos.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap hero-cta">
            <Link to="/cadastro">
              <Button size="lg" className="rounded-pill shadow-glow font-display" style={{ background: "var(--gradient-primary)" }}>
                Começar agora <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="rounded-pill font-display">Já tenho conta</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6">
        {[
          { icon: Map, title: "Mapa do Brasil interativo", desc: "Clique em estados e cidades para prospectar regiões específicas." },
          { icon: Send, title: "Campanhas no WhatsApp", desc: "Mensagens personalizadas com variáveis e follow-ups automáticos." },
          { icon: ShieldCheck, title: "IA que sugere o próximo passo", desc: "Para cada lead, a IA sugere a melhor resposta e horário de envio." },
        ].map((f) => (
          <div
            key={f.title}
            className="card-glow rounded-[20px] p-6"
            style={{ background: "var(--gradient-card)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-card)" }}
          >
            <div
              className="grid place-items-center h-10 w-10 rounded-lg mb-4"
              style={{ background: "var(--color-primary-glow)", color: "var(--color-primary-light)" }}
            >
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold mb-1 text-lg">{f.title}</h3>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{f.desc}</p>
          </div>
        ))}
      </section>

      <footer style={{ background: "var(--color-bg-surface)", borderTop: "1px solid var(--color-border-subtle)" }}>
        <div className="container mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <ZapScoutLogo size={24} />
            <span className="font-display font-bold" style={{ color: "var(--color-primary-light)" }}>ZapScout</span>
          </div>
          <a
            href="https://wa.me/"
            target="_blank"
            rel="noreferrer"
            className="animate-zap-pulse inline-flex items-center gap-2 rounded-pill px-6 py-3 font-display font-semibold text-white"
            style={{ background: "var(--gradient-zap)" }}
          >
            <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
          </a>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>© 2025 ZapScout. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
