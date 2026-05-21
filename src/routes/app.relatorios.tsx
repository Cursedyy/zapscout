import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { useStore, STATUS_COLUNAS, type CrmLead } from "@/store/app-store";
import { calcularScoreObjetivo } from "@/lib/lead-score";
import {
  TrendingUp, Users, MessageCircle, CheckCircle2, DollarSign, Target, FileDown, FileText,
  CalendarIcon, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 1 });

export const Route = createFileRoute("/app/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: RelatoriosPage,
});

const COLORS = ["#6B7280", "#6050D6", "#3B82F6", "#F0A14E", "#25D366", "#F04E4E"];

type Periodo = "7d" | "30d" | "90d" | "custom";
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

function exportCSV(kpis: Kpi[], fechados: CrmLead[], periodoLabel: string) {
  const lines: string[] = [];
  lines.push("Relatório ZapScout");
  lines.push(`Período;${periodoLabel}`);
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

async function exportPDF(kpis: Kpi[], fechados: CrmLead[], faturamento: number, periodoLabel: string) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, opts: unknown) => void }).default;
  const doc = new jsPDF();
  doc.setFontSize(18); doc.text("Relatório ZapScout", 14, 18);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`Período: ${periodoLabel}`, 14, 24);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 29);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 35,
    head: [["Indicador", "Valor"]],
    body: kpis.map((k) => [k.label, k.value]),
    theme: "striped",
    headStyles: { fillColor: [96, 80, 214] },
  });

  const afterKpisY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFontSize(13); doc.text("Leads fechados", 14, afterKpisY);
  autoTable(doc, {
    startY: afterKpisY + 4,
    head: [["Empresa", "Nicho", "Cidade", "Telefone", "Valor", "Adicionado"]],
    body: fechados.length === 0
      ? [["—", "—", "—", "—", "—", "—"]]
      : fechados.map((l) => [
          l.nome,
          l.nicho || "—",
          l.cidade || "—",
          l.telefone || "—",
          fmtBRL(l.valorFechado ?? 0),
          l.addedAt ? new Date(l.addedAt).toLocaleDateString("pt-BR") : "—",
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

function getCorteTimestamp(periodo: Periodo, inicio?: Date, fim?: Date): { inicio: number; fim: number; label: string } {
  const agora = new Date();
  const fimDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999).getTime();
  if (periodo === "custom" && inicio && fim) {
    const ini = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()).getTime();
    const end = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59, 999).getTime();
    return { inicio: ini, fim: end, label: `${format(inicio, "dd/MM/yyyy")} – ${format(fim, "dd/MM/yyyy")}` };
  }
  const dias = periodo === "7d" ? 7 : periodo === "30d" ? 30 : 90;
  const ini = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - dias + 1).getTime();
  return { inicio: ini, fim: fimDia, label: `Últimos ${dias} dias` };
}

function RelatoriosPage() {
  const { leads, buscasUsadas, campanhas } = useStore();
  const [mounted, setMounted] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [dataInicio, setDataInicio] = useState<Date | undefined>(undefined);
  const [dataFim, setDataFim] = useState<Date | undefined>(undefined);
  const [filtroAberto, setFiltroAberto] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const corte = useMemo(() => getCorteTimestamp(periodo, dataInicio, dataFim), [periodo, dataInicio, dataFim]);

  const leadsFiltrados = useMemo(() => {
    return leads.filter((l) => l.addedAt >= corte.inicio && l.addedAt <= corte.fim);
  }, [leads, corte]);

  const contatados = leadsFiltrados.filter((l) => l.status !== "novo").length;
  const respondidos = leadsFiltrados.filter((l) => ["respondeu", "negociacao", "fechado"].includes(l.status)).length;
  const fechadosLeads = leadsFiltrados.filter((l) => l.status === "fechado");
  const fechados = fechadosLeads.length;
  const taxa = contatados > 0 ? Math.round((respondidos / contatados) * 100) : 0;
  const faturamento = fechadosLeads.reduce((sum, l) => sum + (l.valorFechado ?? 0), 0);
  const fechadosComValor = fechadosLeads.filter((l) => (l.valorFechado ?? 0) > 0).length;
  const ticketMedio = fechadosComValor > 0 ? faturamento / fechadosComValor : 0;
  const taxaConversao = leadsFiltrados.length > 0 ? Math.round((fechados / leadsFiltrados.length) * 100) : 0;

  // Mock data semanal — combina busca real com base
  const semanas = Array.from({ length: 8 }).map((_, i) => {
    const base = [12, 18, 22, 15, 28, 34, 25, buscasUsadas || 21][i];
    return { semana: `S${i + 1}`, leads: base, contatados: Math.round(base * 0.7) };
  });

  const temDados = leadsFiltrados.length > 1;
  const pieData = temDados
    ? STATUS_COLUNAS.map((c) => ({ name: c.label, value: leadsFiltrados.filter((l) => l.status === c.id).length }))
    : STATUS_COLUNAS.map((c, i) => ({ name: c.label, value: [4, 8, 5, 3, 2, 1][i] }));

  // top nichos
  const nichosMap = new Map<string, { leads: number; contatados: number; respondidos: number }>();
  leadsFiltrados.forEach((l) => {
    const ent = nichosMap.get(l.nicho) ?? { leads: 0, contatados: 0, respondidos: 0 };
    ent.leads++;
    if (l.status !== "novo") ent.contatados++;
    if (["respondeu", "negociacao", "fechado"].includes(l.status)) ent.respondidos++;
    nichosMap.set(l.nicho, ent);
  });
  const topNichos = Array.from(nichosMap.entries()).sort((a, b) => b[1].leads - a[1].leads).slice(0, 5);

  // Faturamento por semana (segunda → domingo) dentro do período filtrado
  const faturamentoSemana = useMemo(() => {
    const buckets = new Map<number, number>();
    fechadosLeads.forEach((l) => {
      const d = new Date(l.addedAt);
      const dia = d.getDay(); // 0=dom
      const diffSeg = (dia + 6) % 7;
      const inicioSemana = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffSeg).getTime();
      buckets.set(inicioSemana, (buckets.get(inicioSemana) ?? 0) + (l.valorFechado ?? 0));
    });
    // Garantir todas as semanas do período (mesmo que zero) para visualização contínua
    const msSemana = 7 * 24 * 60 * 60 * 1000;
    const d0 = new Date(corte.inicio);
    const diffSeg0 = (d0.getDay() + 6) % 7;
    let cur = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - diffSeg0).getTime();
    const arr: { semana: string; faturamento: number; ts: number }[] = [];
    while (cur <= corte.fim) {
      arr.push({
        ts: cur,
        semana: format(new Date(cur), "dd/MM"),
        faturamento: buckets.get(cur) ?? 0,
      });
      cur += msSemana;
    }
    return arr;
  }, [fechadosLeads, corte]);

  // Faturamento por campanha
  const faturamentoCampanha = useMemo(() => {
    const valorPorLead = new Map<string, number>();
    fechadosLeads.forEach((l) => valorPorLead.set(l.id, l.valorFechado ?? 0));
    const data = campanhas.map((c) => {
      const total = c.items.reduce((sum, it) => sum + (valorPorLead.get(it.leadId) ?? 0), 0);
      const nomeCurto = c.nome.length > 18 ? c.nome.slice(0, 17) + "…" : c.nome;
      return { nome: nomeCurto, nomeCompleto: c.nome, faturamento: total };
    }).filter((d) => d.faturamento > 0)
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 8);
    return data;
  }, [campanhas, fechadosLeads]);

  const kpis: Kpi[] = [
    { label: "Leads no CRM", value: String(leadsFiltrados.length) },
    { label: "Contatados", value: String(contatados) },
    { label: "Respondidos", value: String(respondidos) },
    { label: "Taxa de resposta", value: `${taxa}%` },
    { label: "Conversões (fechados)", value: String(fechados) },
    { label: "Faturamento total", value: fmtBRL(faturamento) },
    { label: "Ticket médio", value: ticketMedio > 0 ? fmtBRL(ticketMedio) : "—" },
    { label: "Taxa de conversão", value: `${taxaConversao}%` },
  ];

  const labelPeriodo = periodo === "custom" && dataInicio && dataFim
    ? `${format(dataInicio, "dd/MM/yyyy")} – ${format(dataFim, "dd/MM/yyyy")}`
    : periodo === "7d" ? "Últimos 7 dias" : periodo === "90d" ? "Últimos 90 dias" : "Últimos 30 dias";

  const periodoBtnLabel = periodo === "custom" && dataInicio && dataFim
    ? `${format(dataInicio, "dd/MM")} – ${format(dataFim, "dd/MM")}`
    : labelPeriodo;

  return (
    <div className="p-4 sm:p-6 md:p-10 pt-16 md:pt-10 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <PageHeader title="Relatórios" subtitle={`Performance no período: ${labelPeriodo}`} />
        <div className="flex gap-2 shrink-1">
          {/* Filtro de período */}
          <Popover open={filtroAberto} onOpenChange={setFiltroAberto}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <CalendarIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{periodoBtnLabel}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3 space-y-3" align="end">
              <div className="text-sm font-medium">Filtrar por período</div>
              <div className="grid grid-cols-3 gap-2">
                {(["7d", "30d", "90d"] as Periodo[]).map((p) => (
                  <Button
                    key={p}
                    variant={periodo === p ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setPeriodo(p); setFiltroAberto(false); }}
                  >
                    {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "90 dias"}
                  </Button>
                ))}
              </div>
              <Button
                variant={periodo === "custom" ? "default" : "outline"}
                size="sm"
                className="w-full"
                onClick={() => setPeriodo("custom")}
              >
                Personalizado
              </Button>
              {periodo === "custom" && (
                <div className="space-y-2 pt-1">
                  <div className="text-xs text-muted-foreground">Intervalo</div>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !dataInicio && "text-muted-foreground")}>
                          {dataInicio ? format(dataInicio, "dd/MM/yyyy") : "Início"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={dataInicio} onSelect={setDataInicio} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !dataFim && "text-muted-foreground")}>
                          {dataFim ? format(dataFim, "dd/MM/yyyy") : "Fim"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={dataFim} onSelect={setDataFim} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button size="sm" className="w-full" disabled={!dataInicio || !dataFim} onClick={() => setFiltroAberto(false)}>
                    Aplicar
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" onClick={() => exportCSV(kpis, fechadosLeads, labelPeriodo)}>
            <FileDown className="h-4 w-4 mr-1.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(kpis, fechadosLeads, faturamento, labelPeriodo)}>
            <FileText className="h-4 w-4 mr-1.5" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} label="Leads no CRM" value={leadsFiltrados.length || 0} hint={`+${buscasUsadas} buscas`} color="text-primary" />
        <StatCard icon={MessageCircle} label="Contatados" value={contatados} hint={`${leadsFiltrados.length ? Math.round((contatados / leadsFiltrados.length) * 100) : 0}% do total`} color="text-info" />
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
            {fechadosComValor > 2
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
          hint={`${fechados} fechado(s) / ${leadsFiltrados.length} no CRM`}
          color="text-success"
        />
      </div>

      <QualidadeBaseSection leads={leadsFiltrados} />


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

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Faturamento por semana</div>
            <div className="text-xs text-muted-foreground">{fmtBRL(faturamento)} no período</div>
          </div>
          <div className="h-64">
            {mounted ? (
              faturamentoSemana.some((s) => s.faturamento > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={faturamentoSemana}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="semana" stroke="#897CB0" fontSize={11} />
                    <YAxis stroke="#897CB0" fontSize={11} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip
                      contentStyle={{ background: "#1E1550", border: "1px solid rgba(96,80,214,0.3)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [fmtBRL(v), "Faturamento"]}
                      labelFormatter={(l: string) => `Semana de ${l}`}
                    />
                    <Bar dataKey="faturamento" fill="#25D366" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                  Sem faturamento no período — feche leads com valor preenchido para ver a evolução semanal.
                </div>
              )
            ) : <div className="h-full w-full rounded bg-secondary/30 animate-pulse" />}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Faturamento por campanha</div>
            <div className="text-xs text-muted-foreground">top {faturamentoCampanha.length || 0}</div>
          </div>
          <div className="h-64">
            {mounted ? (
              faturamentoCampanha.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={faturamentoCampanha} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" stroke="#897CB0" fontSize={11} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <YAxis type="category" dataKey="nome" stroke="#897CB0" fontSize={11} width={110} />
                    <Tooltip
                      contentStyle={{ background: "#1E1550", border: "1px solid rgba(96,80,214,0.3)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [fmtBRL(v), "Faturamento"]}
                      labelFormatter={(_l: string, payload: ReadonlyArray<{ payload?: { nomeCompleto?: string } }>) => payload?.[0]?.payload?.nomeCompleto ?? ""}
                    />
                    <Bar dataKey="faturamento" fill="#6050D6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                  Nenhuma campanha gerou receita ainda — feche leads vinculados a uma campanha para ver o ranking.
                </div>
              )
            ) : <div className="h-full w-full rounded bg-secondary/30 animate-pulse" />}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Leads fechados — auditoria de faturamento */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Leads fechados</div>
            <div className="text-xs text-muted-foreground">{fechadosLeads.length} no período</div>
          </div>
          {fechadosLeads.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhum lead fechado no período — feche leads no CRM para auditar o faturamento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2">Empresa</th>
                    <th className="py-2">Nicho</th>
                    <th className="py-2">Cidade</th>
                    <th className="py-2">Valor</th>
                    <th className="py-2">Data</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fechadosLeads.map((l) => {
                    const statusMeta = STATUS_COLUNAS.find((s) => s.id === l.status);
                    return (
                      <tr key={l.id} className="border-t border-border">
                        <td className="py-2 font-medium">{l.nome}</td>
                        <td className="py-2 capitalize">{l.nicho || "—"}</td>
                        <td className="py-2">{l.cidade || "—"}</td>
                        <td className="py-2 font-medium text-success">{fmtBRL(l.valorFechado ?? 0)}</td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {l.addedAt ? format(new Date(l.addedAt), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                        </td>
                        <td className="py-2">
                          {statusMeta ? (
                            <Badge variant="outline" className={cn("text-[10px]", statusMeta.cls)}>
                              {statusMeta.label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Top nichos prospectados</div>
          {topNichos.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhum lead no período selecionado — ajuste o filtro ou comece em <span className="text-foreground">Buscar leads</span>.
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
    </div>
  );
}

function QualidadeBaseSection({ leads }: { leads: CrmLead[] }) {
  if (leads.length === 0) return null;
  const scored = leads.map((l) => ({ lead: l, score: calcularScoreObjetivo(l).scoreObjetivo }));
  const quentes = scored.filter((s) => s.score >= 75);
  const mornos = scored.filter((s) => s.score >= 45 && s.score < 75);
  const frios = scored.filter((s) => s.score < 45);
  const media = Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length);
  const topQuentes = quentes
    .filter(({ lead }) => lead.status === "novo")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <Card className="p-4 mb-6">
      <div className="text-sm font-medium mb-3">Qualidade da sua base de leads</div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-center">
          <div className="text-2xl font-bold text-destructive">🔥 {quentes.length}</div>
          <div className="text-[10px] text-muted-foreground">Quentes (75+)</div>
        </div>
        <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-center">
          <div className="text-2xl font-bold text-warning">⚡ {mornos.length}</div>
          <div className="text-[10px] text-muted-foreground">Mornos (45-74)</div>
        </div>
        <div className="rounded-lg bg-muted/30 border border-border p-3 text-center">
          <div className="text-2xl font-bold text-muted-foreground">❄️ {frios.length}</div>
          <div className="text-[10px] text-muted-foreground">Frios (&lt;45)</div>
        </div>
      </div>
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">Score médio</span>
          <span className="font-medium">{media}/100</span>
        </div>
        <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${media}%` }} />
        </div>
      </div>
      {topQuentes.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-2">Top {topQuentes.length} leads quentes ainda não contatados</div>
          <div className="space-y-1.5">
            {topQuentes.map(({ lead, score }) => (
              <div key={lead.id} className="flex items-center justify-between text-xs rounded-lg border border-border bg-background/40 px-3 py-2">
                <span className="font-medium truncate">{lead.nome}</span>
                <span className="text-destructive font-semibold ml-2 shrink-0">Score {score} 🔥</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

