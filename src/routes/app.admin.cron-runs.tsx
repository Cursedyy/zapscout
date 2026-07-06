import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, Clock, RotateCcw } from "lucide-react";
import { listCronRunsRemote } from "@/lib/crm.functions";

export const Route = createFileRoute("/app/admin/cron-runs")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/login" });
    const { data: prof } = await supabase
      .from("profiles")
      .select("plano")
      .eq("id", sess.session.user.id)
      .maybeSingle();
    if (prof?.plano !== "dono") throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: "Auditoria do cron — ZapScout" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CronRunsAuditPage,
});

type CronRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  campanhas_consideradas: number;
  campanhas_iniciadas: number;
  leads_selecionados: number;
  mensagens_enviadas: number;
  concluidas: number;
  pulados: number;
  erros: number;
  detalhes: unknown;
  ok: boolean;
  error_message: string | null;
};

type CronRunDetalhe = {
  campanhaId: string;
  nome?: string | null;
  userId?: string;
  resultado: string;
  leadId?: string | null;
  pendentesAntes?: number;
  motivo?: string;
};

const RESULTADO_OK = new Set([
  "enviado",
  "enviado_e_concluida",
  "concluida",
  "iniciada_agendada",
]);

const RESULTADO_LABEL: Record<string, string> = {
  aguardando_intervalo: "Aguardando intervalo/hora",
  aguardando_retry: "Aguardando nova tentativa",
  pausada_sem_whatsapp: "Pausada: WhatsApp desconectado",
  pausada_auth: "Pausada: falha de autenticação",
  pausada_rate_limit: "Pausada: rate limit",
  sem_numero: "Lead sem número válido",
  ja_prospectado: "Lead já prospectado",
  enviado: "Enviado",
  enviado_e_concluida: "Enviado (concluiu)",
  concluida: "Concluída",
  iniciada_agendada: "Iniciada / agendada",
};

function labelResultado(r: string) {
  return RESULTADO_LABEL[r] ?? r.replace(/_/g, " ");
}

function fmtDuration(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

type StatusKind = "ok" | "erro" | "atencao";
function runStatus(r: CronRun): StatusKind {
  if (!r.ok) return "erro";
  if (r.erros > 0) return "atencao";
  return "ok";
}

function CronRunsAuditPage() {
  const list = useServerFn(listCronRunsRemote);
  const [limit, setLimit] = useState(100);
  const [somenteFalhas, setSomenteFalhas] = useState(false);
  const [busca, setBusca] = useState("");
  const { data, refetch, isFetching, isLoading } = useQuery({
    queryKey: ["cron-runs-audit", limit],
    queryFn: () => list({ data: { limit } }),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const runs = (data ?? []) as CronRun[];

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return runs.filter((r) => {
      if (somenteFalhas && r.ok && r.erros === 0) return false;
      if (!q) return true;
      if (r.error_message?.toLowerCase().includes(q)) return true;
      const detalhes = Array.isArray(r.detalhes) ? (r.detalhes as CronRunDetalhe[]) : [];
      return detalhes.some(
        (d) =>
          d.nome?.toLowerCase().includes(q) ||
          d.resultado.toLowerCase().includes(q) ||
          d.motivo?.toLowerCase().includes(q),
      );
    });
  }, [runs, somenteFalhas, busca]);

  const resumo = useMemo(() => {
    const total = runs.length;
    const falhas = runs.filter((r) => !r.ok).length;
    const comErro = runs.filter((r) => r.erros > 0).length;
    const enviadas = runs.reduce((s, r) => s + r.mensagens_enviadas, 0);
    const consideradas = runs.reduce((s, r) => s + r.campanhas_consideradas, 0);
    const duracoes = runs.map((r) => r.duration_ms ?? 0).filter((n) => n > 0);
    const mediaMs = duracoes.length
      ? Math.round(duracoes.reduce((s, n) => s + n, 0) / duracoes.length)
      : null;
    return { total, falhas, comErro, enviadas, consideradas, mediaMs };
  }, [runs]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Auditoria do cron"
        subtitle="Cada execução do process-campaigns: status, duração e o que foi processado."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <SummaryCard label="Execuções" value={resumo.total.toString()} />
        <SummaryCard
          label="Falhas (run.ok = false)"
          value={resumo.falhas.toString()}
          tone={resumo.falhas > 0 ? "destructive" : "muted"}
        />
        <SummaryCard
          label="Runs com erros"
          value={resumo.comErro.toString()}
          tone={resumo.comErro > 0 ? "warning" : "muted"}
        />
        <SummaryCard label="Mensagens enviadas" value={resumo.enviadas.toString()} />
        <SummaryCard
          label="Duração média"
          value={resumo.mediaMs != null ? fmtDuration(resumo.mediaMs) : "—"}
        />
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs text-muted-foreground mb-1 block">
              Buscar (campanha, resultado, motivo, erro)
            </label>
            <Input
              placeholder="ex.: pausada_sem_whatsapp"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Limite</label>
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {[50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  Últimas {n}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm h-9">
            <Switch checked={somenteFalhas} onCheckedChange={setSomenteFalhas} />
            <span>Só falhas / erros</span>
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="ml-auto"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            {isFetching ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando execuções…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Nenhuma execução encontrada com os filtros atuais.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="hidden md:grid grid-cols-[160px_90px_90px_1fr_140px_40px] gap-2 px-3 py-2 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <div>Início</div>
            <div>Status</div>
            <div>Duração</div>
            <div>Contadores</div>
            <div>Detalhe</div>
            <div />
          </div>
          <ul className="divide-y divide-border">
            {filtered.map((r) => (
              <CronRunItem key={r.id} run={r} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "warning" | "destructive";
}) {
  const toneClass =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <Card className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </Card>
  );
}

function StatusPill({ status }: { status: StatusKind }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-xs">
        <CheckCircle2 className="h-3 w-3" /> ok
      </span>
    );
  }
  if (status === "atencao") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 text-warning px-2 py-0.5 text-xs">
        <AlertTriangle className="h-3 w-3" /> com erros
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-xs">
      <AlertTriangle className="h-3 w-3" /> falhou
    </span>
  );
}

function CronRunItem({ run }: { run: CronRun }) {
  const [open, setOpen] = useState(false);
  const started = new Date(run.started_at);
  const status = runStatus(run);
  const detalhes: CronRunDetalhe[] = Array.isArray(run.detalhes)
    ? (run.detalhes as CronRunDetalhe[])
    : [];
  const problemas = detalhes.filter((d) => !RESULTADO_OK.has(d.resultado));

  return (
    <li className="text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full grid grid-cols-1 md:grid-cols-[160px_90px_90px_1fr_140px_40px] gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
      >
        <div className="tabular-nums">
          <div className="font-medium">{started.toLocaleString("pt-BR")}</div>
          <div className="text-[10px] text-muted-foreground md:hidden">
            {fmtDuration(run.duration_ms)}
          </div>
        </div>
        <div>
          <StatusPill status={status} />
        </div>
        <div className="tabular-nums hidden md:flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />
          {fmtDuration(run.duration_ms)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Counter label="campanhas" value={run.campanhas_consideradas} />
          {run.campanhas_iniciadas > 0 && (
            <Counter label="iniciadas" value={run.campanhas_iniciadas} tone="info" />
          )}
          <Counter label="leads" value={run.leads_selecionados} />
          <Counter label="enviadas" value={run.mensagens_enviadas} tone="success" />
          {run.concluidas > 0 && (
            <Counter label="concluídas" value={run.concluidas} tone="info" />
          )}
          {run.pulados > 0 && <Counter label="pulados" value={run.pulados} tone="warning" />}
          {run.erros > 0 && <Counter label="erros" value={run.erros} tone="destructive" />}
        </div>
        <div className="text-muted-foreground truncate" title={run.error_message ?? undefined}>
          {run.error_message
            ? run.error_message
            : problemas.length > 0
              ? `${problemas.length} campanha(s) não avançaram`
              : detalhes.length === 0
                ? "Sem campanhas neste tick"
                : "Todas processadas"}
        </div>
        <div className="text-muted-foreground text-right">{open ? "−" : "+"}</div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-1.5 bg-muted/10 border-t border-border">
          {run.error_message && (
            <div className="text-destructive/80 text-[11px] break-words">
              Erro do run: {run.error_message}
            </div>
          )}
          {detalhes.length === 0 ? (
            <div className="text-muted-foreground text-xs">
              Nenhuma campanha considerada neste tick.
            </div>
          ) : (
            detalhes.map((d, i) => {
              const isOk = RESULTADO_OK.has(d.resultado);
              return (
                <div
                  key={i}
                  className={`rounded border px-2 py-1.5 ${
                    isOk ? "border-border bg-background" : "border-warning/40 bg-warning/5"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span
                      className={`rounded px-1.5 py-0.5 ${
                        isOk ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                      }`}
                    >
                      {labelResultado(d.resultado)}
                    </span>
                    <span className="font-medium truncate max-w-[280px]">
                      {d.nome ?? d.campanhaId}
                    </span>
                    {d.userId && (
                      <span className="text-muted-foreground">
                        · user: {d.userId.slice(0, 8)}…
                      </span>
                    )}
                    {d.pendentesAntes != null && (
                      <span className="text-muted-foreground">· pendentes: {d.pendentesAntes}</span>
                    )}
                    {d.leadId && (
                      <span className="text-muted-foreground">· lead: {d.leadId.slice(0, 8)}…</span>
                    )}
                  </div>
                  {d.motivo && (
                    <div className="text-muted-foreground text-[11px] break-words mt-0.5">
                      Motivo: {d.motivo}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </li>
  );
}

function Counter({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "info" | "success" | "warning" | "destructive";
}) {
  const cls =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : tone === "destructive"
          ? "bg-destructive/15 text-destructive"
          : tone === "info"
            ? "bg-info/15 text-info"
            : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-1.5 py-0.5 tabular-nums ${cls}`}>
      {label}: {value}
    </span>
  );
}
