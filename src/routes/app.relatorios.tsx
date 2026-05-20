import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { useStore, STATUS_COLUNAS } from "@/store/app-store";
import { TrendingUp, Users, MessageCircle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: RelatoriosPage,
});

const COLORS = ["#6B7280", "#6050D6", "#3B82F6", "#F0A14E", "#25D366", "#F04E4E"];

function RelatoriosPage() {
  const { leads, buscasUsadas } = useStore();

  const contatados = leads.filter((l) => l.status !== "novo").length;
  const respondidos = leads.filter((l) => ["respondeu", "negociacao", "fechado"].includes(l.status)).length;
  const fechados = leads.filter((l) => l.status === "fechado").length;
  const taxa = contatados > 0 ? Math.round((respondidos / contatados) * 100) : 0;

  // Mock data semanal — combina busca real com base
  const semanas = Array.from({ length: 8 }).map((_, i) => {
    const base = [12, 18, 22, 15, 28, 34, 25, buscasUsadas || 21][i];
    return { semana: `S${i + 1}`, leads: base, contatados: Math.round(base * 0.7) };
  });

  const pieData = STATUS_COLUNAS.map((c) => ({ name: c.label, value: leads.filter((l) => l.status === c.id).length || (c.id === "novo" ? 4 : c.id === "contatado" ? 8 : c.id === "respondeu" ? 5 : c.id === "negociacao" ? 3 : c.id === "fechado" ? 2 : 1) }));

  // top nichos
  const nichosMap = new Map<string, { leads: number; contatados: number; respondidos: number }>();
  leads.forEach((l) => {
    const ent = nichosMap.get(l.nicho) ?? { leads: 0, contatados: 0, respondidos: 0 };
    ent.leads++;
    if (l.status !== "novo") ent.contatados++;
    if (["respondeu", "negociacao", "fechado"].includes(l.status)) ent.respondidos++;
    nichosMap.set(l.nicho, ent);
  });
  const topNichos = Array.from(nichosMap.entries()).sort((a, b) => b[1].leads - a[1].leads).slice(0, 5);
  if (topNichos.length === 0) {
    topNichos.push(["clínica odontológica", { leads: 34, contatados: 28, respondidos: 12 }]);
    topNichos.push(["restaurante", { leads: 21, contatados: 15, respondidos: 6 }]);
    topNichos.push(["pet shop", { leads: 18, contatados: 12, respondidos: 5 }]);
    topNichos.push(["energia solar", { leads: 14, contatados: 9, respondidos: 4 }]);
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 pt-16 md:pt-10 max-w-7xl mx-auto">
      <PageHeader title="Relatórios" subtitle="Performance da sua prospecção neste mês" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat icon={Users} label="Leads no CRM" value={leads.length || 0} hint={`+${buscasUsadas} buscas`} color="text-primary" />
        <Stat icon={MessageCircle} label="Contatados" value={contatados} hint={`${leads.length ? Math.round((contatados / leads.length) * 100) : 0}% do total`} color="text-info" />
        <Stat icon={TrendingUp} label="Taxa de resposta" value={`${taxa}%`} hint={`${respondidos} respostas`} color="text-warning" />
        <Stat icon={CheckCircle2} label="Conversões" value={fechados} hint="leads fechados" color="text-success" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Leads por semana</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={semanas}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="semana" stroke="#897CB0" fontSize={11} />
                <YAxis stroke="#897CB0" fontSize={11} />
                <Tooltip contentStyle={{ background: "#1E1550", border: "1px solid rgba(96,80,214,0.3)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="leads" fill="#6050D6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="contatados" fill="#25D366" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Distribuição por status no CRM</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: { name: string; value: number }) => `${e.name} (${e.value})`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1E1550", border: "1px solid rgba(96,80,214,0.3)", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Top nichos prospectados</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="py-2">Nicho</th><th className="py-2">Leads</th><th className="py-2">Contatados</th><th className="py-2">Taxa resposta</th></tr>
            </thead>
            <tbody>
              {topNichos.map(([n, v]) => (
                <tr key={n} className="border-t border-border">
                  <td className="py-2 capitalize">{n}</td>
                  <td className="py-2">{v.leads}</td>
                  <td className="py-2">{v.contatados}</td>
                  <td className="py-2">{v.contatados > 0 ? Math.round((v.respondidos / v.contatados) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, color }: { icon: typeof Users; label: string; value: string | number; hint: string; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${color}`} /> {label}</div>
      <div className="text-2xl font-display font-bold mt-1">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
    </Card>
  );
}
