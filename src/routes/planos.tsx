import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Zap, Sparkles } from "lucide-react";
import { PLANOS, type PlanoId } from "@/data/planos";

export const Route = createFileRoute("/planos")({
  head: () => ({
    meta: [
      { title: "Planos e preços — ZapScout" },
      { name: "description", content: "Escolha o plano ZapScout ideal para sua agência. Prospecção no Google Maps + WhatsApp a partir de R$0/mês." },
      { property: "og:title", content: "Planos ZapScout — Prospecção no Google Maps + WhatsApp" },
      { property: "og:description", content: "Free, Pro e Agência. Comece grátis." },
    ],
    links: [{ rel: "canonical", href: "/planos" }],
  }),
  component: PlanosPage,
});

const COMPARATIVOS: { label: string; key: keyof typeof PLANOS.free | "ia_templates" | "leads_export" | "follow_up" }[] = [
  { label: "Buscas por mês", key: "buscas_mes" },
  { label: "Exportar leads (CSV)", key: "leads_export" },
  { label: "Templates personalizados", key: "templates_custom" },
  { label: "Geração com IA", key: "ia_templates" },
  { label: "Follow-up e agendamentos", key: "follow_up" },
  { label: "Buscas em monitoramento", key: "monitoramento" },
  { label: "Usuários", key: "usuarios" },
];

function PlanosPage() {
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
              <Card key={id} className={`p-6 flex flex-col relative ${p.popular ? "border-primary shadow-primary scale-[1.02]" : "border-border"}`}>
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Mais popular
                  </span>
                )}
                <div className="text-sm text-muted-foreground">{p.nome}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-display font-bold">R$ {p.preco}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>
                <ul className="space-y-2 mt-6 mb-6 text-sm">
                  {p.beneficios.map((b) => (
                    <li key={b} className="flex items-start gap-2"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /> <span>{b}</span></li>
                  ))}
                </ul>
                {p.checkoutUrl ? (
                  <Button asChild className={`mt-auto ${p.popular ? "bg-gradient-primary" : ""}`} variant={p.popular ? "default" : "outline"}>
                    <a href={p.checkoutUrl} target="_blank" rel="noopener noreferrer">Assinar por R$ {p.preco}/mês</a>
                  </Button>
                ) : (
                  <Button asChild className="mt-auto" variant="outline">
                    <Link to="/cadastro">Começar grátis</Link>
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
                  {(Object.keys(PLANOS) as PlanoId[]).map((id) => <th key={id} className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">{PLANOS[id].nome}</th>)}
                </tr>
              </thead>
              <tbody>
                {COMPARATIVOS.map((c) => (
                  <tr key={c.label} className="border-t border-border">
                    <td className="px-4 py-3 text-muted-foreground">{c.label}</td>
                    {(Object.keys(PLANOS) as PlanoId[]).map((id) => {
                      const v = PLANOS[id][c.key as keyof (typeof PLANOS)[PlanoId]];
                      return (
                        <td key={id} className="px-4 py-3">
                          {typeof v === "boolean" ? (v ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-muted-foreground/40" />)
                            : typeof v === "number" ? (v >= 999 ? "Ilimitado" : v === 0 ? <X className="h-4 w-4 text-muted-foreground/40" /> : v)
                            : String(v)}
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
