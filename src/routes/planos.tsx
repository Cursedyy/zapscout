import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Zap, Sparkles } from "lucide-react";
import { PLANOS, type Plano, type PlanoId } from "@/data/planos";
import { trackFunnelEvent } from "@/lib/funnel-events";

export const Route = createFileRoute("/planos")({
  head: () => ({
    meta: [
      { title: "Planos e preços — ZapScout" },
      { name: "description", content: "Escolha o plano ZapScout ideal para sua agência. Prospecção no Google Maps + WhatsApp a partir de R$0/mês." },
      { property: "og:title", content: "Planos ZapScout — Prospecção no Google Maps + WhatsApp" },
      { property: "og:description", content: "Free, Pro, Agência e Business. Comece grátis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/planos" }],
  }),
  component: PlanosPage,
});

const COMPARATIVOS: { label: string; render: (p: Plano) => React.ReactNode }[] = [
  {
    label: "Buscas por mês",
    render: (p) => (p.buscas_mes >= 99999 ? "Ilimitado" : p.buscas_mes),
  },
  {
    label: "Exportar leads (CSV)",
    render: (p) =>
      p.leads_export ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground/40" />
      ),
  },
  {
    label: "Templates personalizados",
    render: (p) => (p.templates_custom >= 999 ? "Ilimitado" : p.templates_custom),
  },
  {
    label: "Geração com IA",
    render: (p) =>
      p.ia_templates ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground/40" />
      ),
  },
  {
    label: "Follow-up e agendamentos",
    render: (p) =>
      p.follow_up ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground/40" />
      ),
  },
  {
    label: "Campanhas de disparo",
    render: (p) =>
      p.campanhas ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground/40" />
      ),
  },
  {
    label: "Buscas em monitoramento",
    render: (p) => (p.monitoramento >= 999 ? "Ilimitado" : p.monitoramento),
  },
  {
    label: "Aquecimento de número",
    render: (p) => p.aquecimento,
  },
  {
    label: "Intensidade agressiva",
    render: (p) =>
      p.aquecimento_agressivo ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground/40" />
      ),
  },
  {
    label: "Usuários",
    render: (p) => (p.usuarios >= 999 ? "Ilimitado" : p.usuarios),
  },
  {
    label: "Suporte prioritário SLA",
    render: (p) =>
      p.suporte_sla ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground/40" />
      ),
  },
];

function PlanosPage() {
  useEffect(() => {
    void trackFunnelEvent("plans_viewed");
  }, []);

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid place-items-center h-8 w-8 rounded-lg bg-gradient-primary"><Zap className="h-4 w-4 text-primary-foreground" /></div>
            <span className="font-display font-bold" style={{ color: "var(--color-primary-light)" }}>ZapScout</span>
          </Link>
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/login">Entrar</Link></Button>
            <Button asChild size="sm"><Link to="/cadastro">Criar conta</Link></Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 md:py-20">
        <div className="text-center mb-12">
          <span className="inline-block px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium mb-4">Preços simples</span>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-3">Escolha o plano que cabe na sua operação</h1>
          <p className="text-muted-foreground">Comece grátis. Faça upgrade quando precisar de mais buscas e automações.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {(Object.keys(PLANOS) as PlanoId[]).filter((id) => !PLANOS[id].hidden).map((id) => {
            const p = PLANOS[id];
            return (
              <Card key={id} className={`p-6 flex flex-col relative ${p.popular ? "border-primary shadow-primary scale-[1.02]" : id === "business" ? "border-amber-400/60 shadow-[0_0_30px_-12px_rgba(245,158,11,0.5)]" : "border-border"}`}>
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Mais popular
                  </span>
                )}
                {id === "business" && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-950 text-xs font-semibold inline-flex items-center gap-1 shadow-md">
                    <Sparkles className="h-3 w-3" /> Enterprise
                  </span>
                )}
                <div className={`text-sm ${id === "business" ? "text-amber-400 font-semibold" : "text-muted-foreground"}`}>{p.nome}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-display font-bold">R$ {p.preco}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>
                <ul className="space-y-2 mt-6 mb-6 text-sm">
                  {p.beneficios.map((b) => (
                    <li key={b} className="flex items-start gap-2"><Check className={`h-4 w-4 mt-0.5 shrink-0 ${id === "business" ? "text-amber-400" : "text-success"}`} /> <span>{b}</span></li>
                  ))}
                </ul>
                {p.checkoutUrl ? (
                  <Button asChild className={`mt-auto ${p.popular ? "bg-gradient-primary" : id === "business" ? "bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-950 hover:from-amber-400 hover:to-yellow-300" : ""}`} variant={p.popular || id === "business" ? "default" : "outline"}>
                    <a href={p.checkoutUrl} target="_blank" rel="noopener noreferrer" onClick={() => void trackFunnelEvent("checkout_clicked", id)}>Assinar por R$ {p.preco}/mês</a>
                  </Button>
                ) : p.preco === 0 ? (
                  <Button asChild className="mt-auto" variant="outline">
                    <Link to="/cadastro">Começar grátis</Link>
                  </Button>
                ) : (
                  <Button className="mt-auto" variant="outline" disabled>
                    Assinatura temporariamente indisponível
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        <div className="mt-16 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left">
                <tr>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">Recurso</th>
                  {(Object.keys(PLANOS) as PlanoId[]).filter((id) => !PLANOS[id].hidden).map((id) => <th key={id} className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">{PLANOS[id].nome}</th>)}
                </tr>
              </thead>
              <tbody>
                {COMPARATIVOS.map((c) => (
                  <tr key={c.label} className="border-t border-border">
                    <td className="px-4 py-3 text-muted-foreground">{c.label}</td>
                    {(Object.keys(PLANOS) as PlanoId[]).filter((id) => !PLANOS[id].hidden).map((id) => {
                      const p = PLANOS[id];
                      return (
                        <td key={id} className="px-4 py-3">
                          {c.render(p)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
