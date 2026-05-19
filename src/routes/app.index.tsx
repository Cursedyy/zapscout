import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Send, MessageSquare, TrendingUp, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Dashboard — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Dashboard,
});

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}


function StatCard({ icon: Icon, label, value, hint, accent }: { icon: any; label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={`grid place-items-center h-9 w-9 rounded-lg ${accent ?? "bg-primary/15 text-primary"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-3xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Dashboard() {
  const { data: leads, isLoading: loadingLeads } = useQuery({
    queryKey: ["leads-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("status, segmento");
      return data ?? [];
    },
  });
  const { data: msgs, isLoading: loadingMsgs } = useQuery({
    queryKey: ["msgs-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("mensagens_enviadas").select("respondeu, enviado_em");
      return data ?? [];
    },
  });

  const isLoading = loadingLeads || loadingMsgs;
  const totalLeads = leads?.length ?? 0;
  const totalMsgs = msgs?.length ?? 0;
  const respondidas = msgs?.filter((m) => m.respondeu).length ?? 0;
  const convertidos = leads?.filter((l) => l.status === "convertido").length ?? 0;
  const taxaResposta = totalMsgs > 0 ? Math.round((respondidas / totalMsgs) * 100) : 0;

  const porSegmento = Object.entries(
    (leads ?? []).reduce<Record<string, number>>((acc, l) => {
      const k = l.segmento || "Outros";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value })).slice(0, 6);


  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader title="Dashboard" subtitle="Visão geral das suas prospecções" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard icon={Users} label="Total de leads" value={String(totalLeads)} hint="Capturados até agora" />
            <StatCard icon={Send} label="Mensagens enviadas" value={String(totalMsgs)} accent="bg-info/15 text-info" />
            <StatCard icon={MessageSquare} label="Taxa de resposta" value={`${taxaResposta}%`} accent="bg-warning/15 text-warning" />
            <StatCard icon={TrendingUp} label="Convertidos" value={String(convertidos)} accent="bg-success/15 text-success" />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold mb-4">Leads por segmento</h2>
          {isLoading ? (
            <div className="h-64 flex items-end gap-3 px-2">
              {[60, 80, 45, 90, 55, 70].map((h, i) => (
                <Skeleton key={i} className="flex-1 rounded-t-lg" style={{ height: `${h}%` }} />
              ))}
            </div>
          ) : porSegmento.length === 0 ? (
            <div className="h-64 grid place-items-center text-sm text-muted-foreground">
              Capture seus primeiros leads para ver o gráfico.

            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porSegmento}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.03 250 / 50%)" />
                <XAxis dataKey="name" stroke="oklch(0.7 0.02 250)" fontSize={12} />
                <YAxis stroke="oklch(0.7 0.02 250)" fontSize={12} />
                <Tooltip contentStyle={{ background: "oklch(0.22 0.03 250)", border: "1px solid oklch(0.3 0.03 250)", borderRadius: 12 }} />
                <Bar dataKey="value" fill="oklch(0.74 0.18 145)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Sugestões da IA</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-secondary/60 p-3">
              <div className="font-medium mb-1">Comece prospectando</div>
              <p className="text-muted-foreground">Vá ao Mapa, escolha uma cidade e busque um segmento (ex: clínicas).</p>
            </div>
            <div className="rounded-lg bg-secondary/60 p-3">
              <div className="font-medium mb-1">Conecte seu WhatsApp</div>
              <p className="text-muted-foreground">Para iniciar envios automáticos, conecte uma instância na aba WhatsApp.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
