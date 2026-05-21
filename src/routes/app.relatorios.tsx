import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { useStore, STATUS_COLUNAS, type CrmLead } from "@/store/app-store";
import { TrendingUp, Users, MessageCircle, CheckCircle2, DollarSign, Target, FileDown, FileText } from "lucide-react";
import { toast } from "sonner";

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export const Route = createFileRoute("/app/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: RelatoriosPage,
});

const COLORS = ["#6B7280", "#6050D6", "#3B82F6", "#F0A14E", "#25D366", "#F04E4E"];

type Kpi = { label: string; value: string };

function csvEscape(v: string | number | undefined | null) {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function exportCSV(kpis: Kpi[], fechados: CrmLead[]) {
  const lines: string[] = [];
  lines.push("Relatório ZapScout");
  lines.push(`Gerado em;${new Date().toLocaleString("pt-BR")}`);
  lines.push("");
  lines.push("Indicador;Valor");
  kpis.forEach((k) => lines.push(`${csvEscape(k.label)};${csvEscape(k.value)}`));
  lines.push("");
  lines.push("Leads fechados");
  lines.push("Empresa;Nicho;Cidade;Telefone;Valor fechado;Adicionado em");
  fechados.forEach((l) => {
    lines.push([
      csvEscape(l.nome), csvEscape(l.nicho), csvEscape(l.cidade),
      csvEscape(l.telefone), csvEscape(l.valorFechado ?? 0),
      csvEscape(l.addedAt ? new Date(l.addedAt).toLocaleDateString("pt-BR") : "—"),
    ].join(";"));
  });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob("\uFEFF" + lines.join("\n"), `relatorio-zapscout-${stamp}.csv`, "text/csv;charset=utf-8");
  toast.success("CSV exportado");
}

async function exportPDF(kpis: Kpi[], fechados: CrmLead[], faturamento: number) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
  const doc = new jsPDF();
  doc.setFontSize(18); doc.text("Relatório ZapScout", 14, 18);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 25);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 32,
    head: [["Indicador", "Valor"]],
    body: kpis.map((k) => [k.label, k.value]),
    theme: "striped",
    headStyles: { fillColor: [96, 80, 214] },
  });

  const afterKpisY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFontSize(13); doc.text("Leads fechados", 14, afterKpisY);
  autoTable(doc, {
    startY: afterKpisY + 4,
    head: [["Empresa", "Nicho", "Cidade/UF", "WhatsApp", "Valor", "Data"]],
    body: fechados.length === 0
      ? [["—", "—", "—", "—", "—", "—"]]
      : fechados.map((l) => [
          l.nomeEmpresa,
          l.nicho || "—",
          [l.cidade, l.estado].filter(Boolean).join("/") || "—",
          l.whatsapp || "—",
          fmtBRL(l.valorFechado ?? 0),
          fmtDate(l.updatedAt),
        ]),
    theme: "striped",
    headStyles: { fillColor: [96, 80, 214] },
    styles: { fontSize: 9 },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text(`Faturamento total: ${fmtBRL(faturamento)}`, 14, finalY);

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`relatorio-zapscout-${stamp}.pdf`);
  toast.success("PDF exportado");
}

function RelatoriosPage() {
  const { leads, buscasUsadas } = useStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const contatados = leads.filter((l) => l.status !== "novo").length;
  const respondidos = leads.filter((l) => ["respondeu", "negociacao", "fechado"].includes(l.status)).length;
  const fechadosLeads = leads.filter((l) => l.status === "fechado");
  const fechados = fechadosLeads.length;
  const taxa = contatados > 0 ? Math.round((respondidos / contatados) * 100) : 0;
  const faturamento = fechadosLeads.reduce((sum, l) => sum + (l.valorFechado ?? 0), 0);
  const fechadosComValor = fechadosLeads.filter((l) => (l.valorFechado ?? 0) > 0).length;
  const ticketMedio = fechadosComValor > 0 ? faturamento / fechadosComValor : 0;
  const taxaConversao = leads.length > 0 ? Math.round((fechados / leads.length) * 100) : 0;

  // Mock data semanal — combina busca real com base
  const semanas = Array.from({ length: 8 }).map((_, i) => {
    const base = [12, 18, 22, 15, 28, 34, 25, buscasUsadas || 21][i];
    return { semana: `S${i + 1}`, leads: base, contatados: Math.round(base * 0.7) };
  });

  const temDados = leads.length > 0;
  const pieData = temDados
    ? STATUS_COLUNAS.map((c) => ({ name: c.label, value: leads.filter((l) => l.status === c.id).length }))
    : STATUS_COLUNAS.map((c, i) => ({ name: c.label, value: [4, 8, 5, 3, 2, 1][i] }));

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
  // (sem dados reais → tabela mostra estado vazio mais abaixo)

  return (
    <div className="p-4 sm:p-6 md:p-10 pt-16 md:pt-10 max-w-7xl mx-auto">
      <PageHeader title="Relatórios" subtitle="Performance da sua prospecção neste mês" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} label="Leads no CRM" value={leads.length || 0} hint={`+${buscasUsadas} buscas`} color="text-primary" />
        <StatCard icon={MessageCircle} label="Contatados" value={contatados} hint={`${leads.length ? Math.round((contatados / leads.length) * 100) : 0}% do total`} color="text-info" />
        <StatCard icon={TrendingUp} label="Taxa de resposta" value={`${taxa}%`} hint={`${respondidos} respostas`} color="text-warning" />
        <StatCard icon={CheckCircle2} label="Conversões" value={fechados} hint="leads fechados" color="text-success" />
      </div>

      {/* Faturamento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card className="p-4 bg-gradient-to-br from-primary/15 to-transparent border-primary/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <DollarSign className="h-4 w-4 text-primary" /> Faturamento total
          </div>
          <div className="text-3xl font-display font-bold mt-1 text-primary">{fmtBRL(faturamento)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {fechadosComValor > 0
              ? `${fechadosComValor} de ${fechados} fechados com valor preenchido`
              : fechados > 0
                ? "Preencha o valor em cada lead fechado"
                : "Feche seu primeiro lead para começar"}
          </div>
        </Card>
        <StatCard
          icon={Target}
          label="Ticket médio"
          value={ticketMedio > 0 ? fmtBRL(ticketMedio) : "—"}
          hint={fechadosComValor > 0 ? `base: ${fechadosComValor} fechado(s)` : "sem valores ainda"}
          color="text-warning"
        />
        <StatCard
          icon={TrendingUp}
          label="Taxa de conversão"
          value={`${taxaConversao}%`}
          hint={`${fechados} fechado(s) / ${leads.length} no CRM`}
          color="text-success"
        />
      </div>


      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Leads por semana</div>
          <div className="h-64">
            {mounted ? (
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
            ) : <div className="h-full w-full rounded bg-secondary/30 animate-pulse" />}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Distribuição por status no CRM</div>
          <div className="h-64">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: { name: string; value: number }) => `${e.name} (${e.value})`}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1E1550", border: "1px solid rgba(96,80,214,0.3)", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full w-full rounded bg-secondary/30 animate-pulse" />}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Top nichos prospectados</div>
        {topNichos.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Nenhum lead no CRM ainda — comece em <span className="text-foreground">Buscar leads</span> para ver seus nichos aqui.
          </div>
        ) : (
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
        )}
      </Card>
    </div>
  );
}

