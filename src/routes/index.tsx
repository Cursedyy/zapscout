import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Zap, Map, Sparkles, Send, ShieldCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZapScout — Prospecção ativa de clientes via WhatsApp" },
      { name: "description", content: "Encontre, contate e converta clientes automaticamente com IA e WhatsApp. Mapa de prospecção, leads do Google Maps e follow-ups inteligentes." },
      { property: "og:title", content: "ZapScout — Prospecção ativa via WhatsApp" },
      { property: "og:description", content: "SaaS de prospecção automática com IA, mapa interativo do Brasil e envios via WhatsApp." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="container mx-auto flex items-center justify-between py-6 px-6">
        <div className="flex items-center gap-2">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-gradient-primary shadow-glow">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg">ZapScout</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/login"><Button variant="ghost">Entrar</Button></Link>
          <Link to="/cadastro"><Button>Começar grátis</Button></Link>
        </nav>
      </header>

      <section className="container mx-auto px-6 pt-16 pb-24 text-center max-w-4xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground mb-6">
          <Sparkles className="h-3 w-3 text-primary" /> Prospecção automática com IA
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
          Encontre clientes no <span className="text-primary">mapa</span><br/>
          e venda pelo <span className="text-primary">WhatsApp</span>.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          O ZapScout busca empresas no Google Maps, identifica quem precisa de site e abordagens,
          e dispara mensagens personalizadas no WhatsApp com follow-ups automáticos.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/cadastro">
            <Button size="lg" className="shadow-glow">
              Começar agora <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login"><Button size="lg" variant="outline">Já tenho conta</Button></Link>
        </div>
      </section>

      <section className="container mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6">
        {[
          { icon: Map, title: "Mapa do Brasil interativo", desc: "Clique em estados e cidades para prospectar regiões específicas." },
          { icon: Send, title: "Campanhas no WhatsApp", desc: "Mensagens personalizadas com variáveis e follow-ups automáticos." },
          { icon: ShieldCheck, title: "IA que sugere próximo passo", desc: "Para cada lead, a IA sugere a melhor resposta e horário." },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
            <div className="grid place-items-center h-10 w-10 rounded-lg bg-primary/15 text-primary mb-4">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold mb-1">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
