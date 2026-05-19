import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Send, MessageSquare, KanbanSquare, Clock, Plus, ArrowRight, TrendingUp, Users, Zap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useStore, usePlano, STATUS_COLUNAS } from "@/store/app-store";
import { listarVencidos } from "@/lib/followups";
import { getDashboardStats } from "@/lib/stats.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Painel — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AppDashboard,
});

function AppDashboard() {
  const { leads, campanhas, buscasUsadas, followupDias } = useStore();
  const plano = usePlano();
  const fetchStats = useServerFn(getDashboardStats);
  const statsQ = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const stats = statsQ.data;

  const fuVencidos = listarVencidos(leads, followupDias).length;
  const buscasPct = Math.min(100, (buscasUsadas / plano.buscas_mes) * 100);
  const recentes = [...leads].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6);

  const leadsTotal = stats?.leadsTotal ?? leads.length;
  const taxaResposta = stats?.taxaResposta ?? 0;
  const respostas = stats?.respostas ?? 0;
  const mensagensEnviadas = stats?.mensagensEnviadas ?? 0;
  const fechados = stats?.fechados ?? leads.filter((l) => l.status === "fechado").length;
  const campanhasAtivas = stats?.campanhasAtivas ?? campanhas.filter((c) => c.status === "em_andamento" || c.status === "agendada").length;
  const campanhasTotal = stats?.campanhasTotal ?? campanhas.length;

  return (
    <div className="p-4 sm:p-6 md:p-10 pt-16 md:pt-10 max-w-[1600px] mx-auto">
      <PageHeader title="Painel" subtitle="Visão geral da sua prospecção">
        <Button asChild>
          <Link to="/app/buscar"><Plus className="h-4 w-4" /> Nova busca</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/app/campanhas"><Send className="h-4 w-4" /> Nova campanha</Link>
        </Button>
      </PageHeader>

      {/* KPIs (dados reais do Supabase) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi icon={Users} label="Leads capturados" value={statsQ.isLoading ? "—" : leadsTotal} loading={statsQ.isLoading} accent="text-primary" />
        <Kpi icon={MessageSquare} label="Mensagens disparadas" value={statsQ.isLoading ? "—" : mensagensEnviadas} sub={`${respostas} respostas`} loading={statsQ.isLoading} accent="text-primary" />
        <Kpi icon={TrendingUp} label="Taxa de resposta" value={statsQ.isLoading ? "—" : `${taxaResposta}%`} sub={mensagensEnviadas > 0 ? `${respostas}/${mensagensEnviadas} msgs` : "sem disparos ainda"} loading={statsQ.isLoading} accent="text-success" />
        <Kpi icon={Send} label="Campanhas ativas" value={statsQ.isLoading ? "—" : campanhasAtivas} sub={`${campanhasTotal} no total`} loading={statsQ.isLoading} accent="text-primary" />
      </div>


      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {/* Uso do plano */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Plano {plano.nome}</div>
              <div className="text-sm font-medium mt-0.5">Buscas neste mês</div>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{buscasUsadas}/{plano.buscas_mes}</span>
          </div>
          <div className="h-2 rounded-full bg-secondary/50 overflow-hidden">
            <div className="h-full bg-gradient-primary transition-all" style={{ width: `${buscasPct}%` }} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link to="/app/buscar"><Search className="h-3 w-3" /> Buscar leads</Link>
            </Button>
            {plano.id === "free" && (
              <Button asChild size="sm" className="flex-1">
                <Link to="/planos">Fazer upgrade</Link>
              </Button>
            )}
          </div>
        </div>

        {/* Funil */}
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Funil de vendas</div>
            <Link to="/app/leads" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
              Ver CRM <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {STATUS_COLUNAS.map((col) => {
              const n = leads.filter((l) => l.status === col.id).length;
              const pct = total ? (n / total) * 100 : 0;
              return (
                <div key={col.id} className="flex items-center gap-3">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", col.dot)} />
                  <span className="text-xs w-28 shrink-0">{col.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-secondary/50 overflow-hidden">
                    <div className={cn("h-full", col.dot.replace("bg-", "bg-"))} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <QuickAction to="/app/buscar" icon={Search} title="Nova busca" desc="Prospecte por nicho + cidade" />
        <QuickAction to="/app/campanhas" icon={Send} title="Disparar campanha" desc="Mensagens em massa no WhatsApp" />
        <QuickAction to="/app/follow-ups" icon={Clock} title="Follow-ups" desc={fuVencidos > 0 ? `${fuVencidos} vencidos` : "Sem pendências"} badge={fuVencidos > 0 ? fuVencidos : undefined} />
        <QuickAction to="/app/templates" icon={MessageSquare} title="Templates" desc="Mensagens prontas para WA" />
      </div>

      {/* Leads recentes */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-medium flex items-center gap-2">
            <KanbanSquare className="h-4 w-4 text-primary" /> Leads recentes
          </div>
          <Link to="/app/leads" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
            Ver todos <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {recentes.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum lead ainda.{" "}
            <Link to="/app/buscar" className="text-primary hover:underline">Comece uma busca →</Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentes.map((l) => {
              const col = STATUS_COLUNAS.find((c) => c.id === l.status)!;
              return (
                <Link key={l.id} to="/app/leads" className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{l.nome}</div>
                    <div className="text-xs text-muted-foreground truncate">{l.nicho} · {l.cidade}</div>
                  </div>
                  <span className={cn("hidden sm:inline px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0", col.cls)}>{col.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", accent ?? "text-muted-foreground")} />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-display font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, desc, badge }: { to: string; icon: React.ComponentType<{ className?: string }>; title: string; desc: string; badge?: number }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-card/80 transition-colors relative"
    >
      <div className="flex items-center gap-3">
        <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="text-xs text-muted-foreground truncate">{desc}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
      </div>
      {badge !== undefined && (
        <span className="absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-warning/20 text-warning tabular-nums">{badge}</span>
      )}
    </Link>
  );
}
