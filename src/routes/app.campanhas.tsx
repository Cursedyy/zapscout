import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Send, Clock, Play, Pause, Trash2, Users, CalendarClock, CheckCircle2, AlertCircle, Repeat, MessageSquare, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useStore, type Campanha, type CampanhaStatus, type CampanhaItem } from "@/store/app-store";
import { renderTemplate } from "@/data/templates";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { sendNow } from "@/lib/whatsapp.functions";
import { listDispatchLogsRemote, listCronRunsRemote, listUltimasFalhasPorCampanhaRemote, type CampanhaUltimaFalha } from "@/lib/crm.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: CampanhasPage,
});

const STATUS_CLS: Record<CampanhaStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  agendada: "bg-info/15 text-info",
  em_andamento: "bg-warning/15 text-warning animate-pulse",
  pausada: "bg-muted text-muted-foreground",
  concluida: "bg-success/15 text-success",
};

const STATUS_LABEL: Record<CampanhaStatus, string> = {
  rascunho: "Rascunho",
  agendada: "Agendada",
  em_andamento: "Em andamento",
  pausada: "Pausada",
  concluida: "Concluída",
};

function CampanhasPage() {
  const { campanhas, deleteCampanha, setCampanhaStatus } = useStore();
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const qc = useQueryClient();

  // O disparo é feito exclusivamente no servidor pelo cron `process-campaigns`
  // (a cada 1 min), que respeita `last_sent_at + 3600/limite_por_hora`.
  // Realtime (postgres_changes) mantém a tela sincronizada assim que o servidor
  // atualiza a campanha ou grava um log de disparo — sem depender do polling.
  useEffect(() => {
    let cancel = false;
    const cleanupRef: { current: null | (() => void) } = { current: null };
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid || cancel) return;
      const filter = `user_id=eq.${uid}`;
      const channel = supabase
        .channel(`campanhas-rt-${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "campanhas", filter },
          () => {
            qc.invalidateQueries({ queryKey: ["campanhas"] });
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "campanha_dispatch_logs", filter },
          (payload: { new: { campanha_id?: string } | null }) => {
            const cid = payload.new?.campanha_id;
            qc.invalidateQueries({ queryKey: ["dispatch-logs", cid] });
            qc.invalidateQueries({ queryKey: ["campanhas"] });
          },
        )
        .subscribe();
      cleanupRef.current = () => supabase.removeChannel(channel);
    })();
    const tick = setInterval(() => qc.invalidateQueries({ queryKey: ["campanhas"] }), 60_000);
    return () => {
      cancel = true;
      cleanupRef.current?.();
      clearInterval(tick);
    };
  }, [qc]);


  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader title="Campanhas" subtitle="Crie listas segmentadas, agende e dispare no WhatsApp respeitando um limite por hora.">
        <NovaCampanhaDialog />
      </PageHeader>

      <FollowupSection campanhas={campanhas} />

      <PainelFilaCampanhas campanhas={campanhas} />





      {campanhas.length === 0 ? (
        <div className="rounded-2xl border border-solid border-border p-12 text-center">
          <Send className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-1">Nenhuma campanha criada ainda.</p>
          <p className="text-xs text-muted-foreground">Crie uma campanha para disparar mensagens em lote para vários leads do seu CRM.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {campanhas.map((c) => (
            <CampanhaCard
              key={c.id}
              campanha={c}
              enviando={false}
              onAbrir={() => setDetalheId(c.id)}
              onStart={() => setCampanhaStatus(c.id, "em_andamento")}
              onPause={() => setCampanhaStatus(c.id, "pausada")}
              onDelete={() => { if (confirm("Excluir esta campanha?")) deleteCampanha(c.id); }}
            />
          ))}

        </div>
      )}

      <TrilhaExecucoes />



      {detalheId && (
        <CampanhaDetalheDialog
          campanha={campanhas.find((c) => c.id === detalheId)!}
          onClose={() => setDetalheId(null)}
        />
      )}
    </div>
  );
}

function CampanhaCard({ campanha: c, enviando, onAbrir, onStart, onPause, onDelete }: {
  campanha: Campanha; enviando: boolean; onAbrir: () => void; onStart: () => void; onPause: () => void; onDelete: () => void;
}) {
  const total = c.items.length;
  const enviados = c.items.filter((it) => it.status === "enviado").length;
  const pct = total > 0 ? Math.round((enviados / total) * 100) : 0;
  const intervaloSeg = Math.floor(3600 / c.limitePorHora);
  const temPendente = c.items.some((it) => it.status === "pendente");

  // Tick a cada 1s para atualizar o countdown do próximo envio.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (c.status !== "em_andamento") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [c.status]);

  const now = Date.now();
  const intervaloMs = intervaloSeg * 1000;
  // Cadência mínima do cron do servidor (process-campaigns). Mesmo que o
  // limitePorHora permita enviar antes, o próximo disparo real só ocorre
  // no próximo tick do cron.
  const CRON_TICK_MS = 60_000;
  // Momento em que o limitePorHora libera o próximo envio.
  const permitidoAt = (c.lastSentAt ?? 0) + intervaloMs;
  // Arredonda para o próximo tick do cron (>= agora e >= permitidoAt).
  const alvo = Math.max(permitidoAt, now);
  const proximoTickAt = Math.ceil(alvo / CRON_TICK_MS) * CRON_TICK_MS;
  const ativo = c.status === "em_andamento" && temPendente && !enviando;
  const proximoAt = ativo ? proximoTickAt : null;
  const proximoEm = ativo ? Math.max(0, proximoTickAt - now) : 0;
  const limitadoPorCron = ativo && permitidoAt <= now;

  const fmt = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${r}s`;
  };

  // Próximo retry pendente (item aguardando backoff)
  const retryAts = c.items
    .filter((it) => it.status === "pendente" && it.nextRetryAt)
    .map((it) => Date.parse(it.nextRetryAt as string))
    .filter((n) => Number.isFinite(n) && n > now);
  const proxRetryAt = retryAts.length ? Math.min(...retryAts) : 0;

  const ultimoEnvioLabel = c.lastSentAt
    ? new Date(c.lastSentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  let runtimeLabel: { text: string; cls: string } | null = null;
  let motivo: string | null = null;

  if (c.status === "agendada" && c.agendamento) {
    const ini = new Date(c.agendamento).getTime();
    runtimeLabel = { text: `Agendada · inicia ${new Date(ini).toLocaleString("pt-BR")}`, cls: "bg-info/15 text-info" };
    motivo = ini > now ? `Aguardando horário de início (em ${fmt(ini - now)})` : "Iniciando no próximo ciclo do servidor (~1 min)";
  } else if (c.status === "pausada") {
    runtimeLabel = { text: "Pausada", cls: "bg-muted text-muted-foreground" };
    motivo = "Nada será enviado até você retomar a campanha.";
  } else if (c.status === "em_andamento") {
    if (enviando) {
      runtimeLabel = { text: "Enviando…", cls: "bg-warning/15 text-warning" };
    } else if (!temPendente) {
      if (proxRetryAt > 0) {
        runtimeLabel = { text: `Aguardando retry · próximo em ${fmt(proxRetryAt - now)}`, cls: "bg-info/15 text-info" };
        motivo = `Um item falhou e será tentado novamente às ${new Date(proxRetryAt).toLocaleTimeString("pt-BR")}.`;
      } else {
        runtimeLabel = { text: "Finalizando…", cls: "bg-success/15 text-success" };
      }
    } else if (proximoEm > 0) {
      const horaProx = new Date(proximoAt!).toLocaleTimeString("pt-BR");
      if (limitadoPorCron) {
        runtimeLabel = { text: `Aguardando ciclo do servidor · próximo em ${fmt(proximoEm)}`, cls: "bg-warning/15 text-warning" };
        motivo = `Limite de ${c.limitePorHora}/h já liberou o envio, mas o cron processa a fila a cada ~60s. Próximo tick às ${horaProx}.`;
      } else {
        runtimeLabel = { text: `Aguardando intervalo · próximo em ${fmt(proximoEm)}`, cls: "bg-info/15 text-info" };
        motivo = `Respeitando limite de ${c.limitePorHora}/h (1 a cada ${intervaloSeg}s) + cron do servidor (~60s). Envio previsto para ${horaProx}.`;
      }
    } else {
      runtimeLabel = { text: "Aguardando ciclo do servidor (~60s)", cls: "bg-warning/15 text-warning" };
      motivo = "O intervalo já venceu. O cron do servidor processa a fila a cada ~60s — o próximo envio sai no próximo tick.";
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between mb-3 gap-3">
        <button onClick={onAbrir} className="text-left min-w-0 flex-1">
          <h3 className="font-semibold truncate">{c.nome}</h3>
          <p className="text-xs text-muted-foreground truncate">
            {c.filtroNicho || "Todos nichos"} · {c.filtroCidade || "Todas cidades"}
          </p>
        </button>
        <Badge className={STATUS_CLS[c.status]}>{STATUS_LABEL[c.status]}</Badge>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground inline-flex items-center gap-1"><Users className="h-3 w-3" /> {enviados}/{total} enviados</span>
          <span className="tabular-nums font-medium">{pct}%</span>
        </div>
        <Progress value={pct} />
      </div>

      {runtimeLabel && (
        <div className={`mb-2 rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${runtimeLabel.cls}`}>
          <Clock className="h-3 w-3 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="tabular-nums">
              {runtimeLabel.text}
              {proximoAt && !enviando && proximoEm > 0 && (
                <span className="text-muted-foreground"> · {new Date(proximoAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              )}
            </div>
            {motivo && <div className="text-[11px] opacity-80 mt-0.5">{motivo}</div>}
            {ultimoEnvioLabel && (
              <div className="text-[11px] opacity-80">Último envio: {ultimoEnvioLabel}</div>
            )}
          </div>
        </div>
      )}


      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-4">
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {c.limitePorHora}/h · 1 a cada {intervaloSeg}s</span>
        {c.agendamento && (
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {new Date(c.agendamento).toLocaleString("pt-BR")}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {c.status === "em_andamento" ? (
          <Button size="sm" variant="outline" onClick={onPause} className="flex-1"><Pause className="h-3 w-3" /> Pausar</Button>
        ) : c.status === "concluida" ? (
          <Button size="sm" variant="outline" onClick={onAbrir} className="flex-1">Ver resultado</Button>
        ) : (
          <Button size="sm" onClick={onStart} className="flex-1 bg-[color:var(--color-zap)] hover:bg-[color:var(--color-zap-dark)] text-white">
            <Play className="h-3 w-3" /> {c.status === "pausada" ? "Retomar" : "Iniciar agora"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    </div>
  );
}


function NovaCampanhaDialog() {
  const { templates, leads, createCampanha, defaultIntervaloSegundos } = useStore();
  const [open, setOpen] = useState(false);

  const [nome, setNome] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [mensagemOverride, setMensagemOverride] = useState("");
  const [filtroNicho, setFiltroNicho] = useState("");
  const [filtroCidade, setFiltroCidade] = useState("");
  const [apenasSemSite, setApenasSemSite] = useState(false);
  const [apenasStatusNovo, setApenasStatusNovo] = useState(true);
  const [limitePorHora, setLimitePorHora] = useState(Math.max(1, Math.round(3600 / defaultIntervaloSegundos)));
  const [agendarPara, setAgendarPara] = useState(""); // datetime-local

  const tpl = templates.find((t) => t.id === templateId);
  const mensagemBase = mensagemOverride || tpl?.mensagem || "";

  const norm = (s: string) =>
    (s || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const destinatarios = useMemo(() => {
    const nichoQ = norm(filtroNicho);
    const cidadeQ = norm(filtroCidade);
    // Exige ao menos um filtro ativo para evitar disparo acidental contra todos os leads
    const algumFiltroAtivo = !!nichoQ || !!cidadeQ || apenasStatusNovo || apenasSemSite;
    if (!algumFiltroAtivo) return [];
    return leads.filter((l) => {
      if (apenasStatusNovo && l.status !== "novo") return false;
      if (apenasSemSite && l.site) return false;
      if (nichoQ && !norm(l.nicho).includes(nichoQ)) return false;
      if (cidadeQ && !norm(l.cidade).includes(cidadeQ)) return false;
      return true;
    });
  }, [leads, apenasStatusNovo, apenasSemSite, filtroNicho, filtroCidade]);

  const previewTexto = destinatarios[0]
    ? renderTemplate(mensagemBase, {
        nome: destinatarios[0].nome, cidade: destinatarios[0].cidade,
        nicho: destinatarios[0].nicho, avaliacao: destinatarios[0].avaliacao,
        telefone: destinatarios[0].telefone, endereco: destinatarios[0].endereco,
      })
    : renderTemplate(mensagemBase, { nome: "(empresa exemplo)", cidade: "São Paulo", nicho: "restaurante", avaliacao: 4.5 });

  const handleCreate = async () => {
    if (!nome.trim()) return toast.error("Dê um nome para a campanha");
    if (!filtroNicho.trim() && !filtroCidade.trim() && !apenasStatusNovo && !apenasSemSite) {
      return toast.error("Ative ao menos um filtro (nicho, cidade, status ou sem site) para não disparar para todos os leads");
    }
    if (destinatarios.length === 0) return toast.error("Nenhum lead corresponde aos filtros");
    const items: CampanhaItem[] = destinatarios.map((l) => ({ leadId: l.id, status: "pendente" }));
    const agendamento = agendarPara ? new Date(agendarPara).getTime() : undefined;
    try {
      await createCampanha({
        nome: nome.trim(), templateId, mensagemOverride: mensagemOverride.trim() || undefined,
        filtroNicho, filtroCidade, apenasSemSite, apenasStatusNovo, limitePorHora, agendamento, items,
      });
      toast.success(`Campanha criada com ${destinatarios.length} destinatários`);
      setOpen(false);
      setNome(""); setMensagemOverride(""); setFiltroNicho(""); setFiltroCidade(""); setAgendarPara("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível criar a campanha.";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Nova campanha</Button></DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome da campanha</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Restaurantes SP sem site" />
            </div>

            <div className="space-y-1.5"><Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {templates.filter((t) => !t.followupStep).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5"><Label>Mensagem (opcional — sobrescreve o template)</Label>
              <Textarea rows={5} value={mensagemOverride} onChange={(e) => setMensagemOverride(e.target.value)} placeholder={tpl?.mensagem ?? ""} />
              <p className="text-[11px] text-muted-foreground">Variáveis: {"{{nome}} {{cidade}} {{nicho}} {{avaliacao}}"}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Filtro nicho</Label>
                <Input value={filtroNicho} onChange={(e) => setFiltroNicho(e.target.value)} placeholder="Ex: restaurante" />
              </div>
              <div className="space-y-1.5"><Label>Filtro cidade</Label>
                <Input value={filtroCidade} onChange={(e) => setFiltroCidade(e.target.value)} placeholder="Ex: São Paulo" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="text-sm">Apenas leads sem site</div>
              <Switch checked={apenasSemSite} onCheckedChange={setApenasSemSite} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="text-sm">Apenas leads novos (status "Novo")</div>
              <Switch checked={apenasStatusNovo} onCheckedChange={setApenasStatusNovo} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-2"><Users className="h-4 w-4 text-primary" /><span className="font-semibold">{destinatarios.length} destinatários</span></div>
              {leads.length === 0 ? (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Seu CRM está vazio — adicione leads em "Buscar leads" antes de criar uma campanha.</p>
              ) : destinatarios.length === 0 ? (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Nenhum lead corresponde aos filtros.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Esses leads receberão a mensagem na ordem do CRM.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Limite por hora: <span className="font-semibold text-foreground">{limitePorHora}</span></Label>
              <Input type="range" min={1} max={120} value={limitePorHora} onChange={(e) => setLimitePorHora(Number(e.target.value))} />
              <p className="text-[11px] text-muted-foreground">1 mensagem a cada {Math.floor(3600 / limitePorHora)}s · ajuda a evitar bloqueio do WhatsApp.</p>
            </div>

            <div className="space-y-1.5"><Label>Agendar início (opcional)</Label>
              <Input type="datetime-local" value={agendarPara} onChange={(e) => setAgendarPara(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Se vazio, a campanha fica em rascunho até você clicar "Iniciar agora".</p>
            </div>

            <div className="rounded-xl border border-border p-3">
              <div className="text-xs text-muted-foreground mb-1">Pré-visualização da mensagem:</div>
              <div className="text-sm whitespace-pre-wrap">{previewTexto || <span className="text-muted-foreground">Selecione um template…</span>}</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button className="flex-1" onClick={handleCreate} disabled={!nome || destinatarios.length === 0}>
            {agendarPara ? "Agendar campanha" : "Criar campanha"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CampanhaDetalheDialog({ campanha: c, onClose }: { campanha: Campanha; onClose: () => void }) {
  const { leads, templates } = useStore();
  const tpl = templates.find((t) => t.id === c.templateId);
  const total = c.items.length;
  const enviados = c.items.filter((it) => it.status === "enviado").length;
  const pendentes = total - enviados;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{c.nome}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-muted/40 p-3"><div className="text-2xl font-bold">{total}</div><div className="text-xs text-muted-foreground">Total</div></div>
            <div className="rounded-lg bg-success/10 p-3"><div className="text-2xl font-bold text-success">{enviados}</div><div className="text-xs text-muted-foreground">Enviados</div></div>
            <div className="rounded-lg bg-warning/10 p-3"><div className="text-2xl font-bold text-warning">{pendentes}</div><div className="text-xs text-muted-foreground">Pendentes</div></div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground mb-1">Template: {tpl?.nome ?? "—"} · Limite: {c.limitePorHora}/h</div>
            <div className="text-sm whitespace-pre-wrap">{c.mensagemOverride || tpl?.mensagem || ""}</div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Destinatários</h4>
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {c.items.map((it) => {
                const lead = leads.find((l) => l.id === it.leadId);
                const retryAt = it.nextRetryAt ? Date.parse(it.nextRetryAt) : 0;
                const aguardandoRetry = it.status === "pendente" && retryAt > Date.now();
                const segundos = aguardandoRetry ? Math.max(1, Math.round((retryAt - Date.now()) / 1000)) : 0;
                return (
                  <div key={it.leadId} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm gap-2">
                    <div className="min-w-0">
                      <div className="truncate">{lead?.nome ?? "(lead removido)"}</div>
                      <div className="text-xs text-muted-foreground truncate">{lead?.telefone}</div>
                      {it.lastError && it.status !== "enviado" && (
                        <div className="text-[11px] text-destructive/80 truncate mt-0.5" title={it.lastError}>Erro: {it.lastError}</div>
                      )}
                    </div>
                    {it.status === "enviado" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success shrink-0"><CheckCircle2 className="h-3 w-3" /> {it.sentAt ? new Date(it.sentAt).toLocaleTimeString("pt-BR") : "enviado"}</span>
                    ) : it.status === "pulado" ? (
                      <span className="text-xs text-muted-foreground shrink-0">pulado</span>
                    ) : it.status === "falha" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive shrink-0"><AlertCircle className="h-3 w-3" /> falha{it.attempts ? ` (${it.attempts}x)` : ""}</span>
                    ) : aguardandoRetry ? (
                      <span className="inline-flex items-center gap-1 text-xs text-info shrink-0" title={`Retry às ${new Date(retryAt).toLocaleTimeString("pt-BR")}`}>
                        <Clock className="h-3 w-3" /> retry em {segundos < 60 ? `${segundos}s` : `${Math.round(segundos / 60)}min`}{it.attempts ? ` · ${it.attempts}ª` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">pendente</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <HistoricoDisparos campanhaId={c.id} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

const LOG_STATUS_STYLE: Record<string, string> = {
  enviado: "bg-success/15 text-success",
  sem_whatsapp: "bg-muted text-muted-foreground",
  sem_numero: "bg-muted text-muted-foreground",
  ja_prospectado: "bg-muted text-muted-foreground",
  retry_agendado: "bg-info/15 text-info",
  falha: "bg-destructive/15 text-destructive",
  pausada_auth: "bg-destructive/15 text-destructive",
  pausada_rate_limit: "bg-warning/15 text-warning",
};

const LOG_STATUS_LABEL: Record<string, string> = {
  enviado: "enviado",
  sem_whatsapp: "sem WhatsApp",
  sem_numero: "sem número",
  ja_prospectado: "já prospectado",
  retry_agendado: "retry agendado",
  falha: "falha",
  pausada_auth: "pausada (auth)",
  pausada_rate_limit: "pausada (rate limit)",
};

function HistoricoDisparos({ campanhaId }: { campanhaId: string }) {
  const list = useServerFn(listDispatchLogsRemote);
  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dispatch-logs", campanhaId],
    queryFn: () => list({ data: { campanhaId, limit: 200 } }),
    refetchInterval: 60_000,
    staleTime: 5_000,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold">Histórico de disparos</h4>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Carregando…</div>
      ) : !logs || logs.length === 0 ? (
        <div className="text-xs text-muted-foreground rounded-md border border-border p-3">
          Nenhum disparo registrado ainda para esta campanha.
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-1.5 text-xs">
          {logs.map((l) => {
            const started = new Date(l.started_at);
            const finished = l.finished_at ? new Date(l.finished_at) : null;
            const dur = l.duration_ms != null ? `${l.duration_ms}ms` : "—";
            const cls = LOG_STATUS_STYLE[l.status] ?? "bg-muted text-muted-foreground";
            const label = LOG_STATUS_LABEL[l.status] ?? l.status;
            return (
              <div key={l.id} className="rounded-md border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{l.lead_nome ?? "(lead)"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {l.numero ?? "—"}
                      {l.attempt ? ` · tentativa ${l.attempt}` : ""}
                      {l.http_status ? ` · HTTP ${l.http_status}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 ${cls}`}>{label}</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>início: {started.toLocaleTimeString("pt-BR")}</span>
                  {finished && <span>fim: {finished.toLocaleTimeString("pt-BR")}</span>}
                  <span>duração: {dur}</span>
                  <span>{started.toLocaleDateString("pt-BR")}</span>
                </div>
                {l.error_message && (
                  <div className="mt-1 text-[11px] text-destructive/80 break-words" title={l.error_message}>
                    {l.error_message.length > 200 ? l.error_message.slice(0, 200) + "…" : l.error_message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type FollowupConfig = {
  ativo: boolean;
  msg1: string;
  msg2: string;
  msg2Horas: number;
  msg3: string;
  msg3Horas: number;
};

const DEFAULT_FOLLOWUP: FollowupConfig = {
  ativo: false,
  msg1: "Olá {{nome}}! Vi que você ainda não respondeu — passando aqui pra saber se faz sentido conversarmos.",
  msg2: "Oi {{nome}}, tudo bem? Só reforçando o contato anterior. Posso te enviar mais detalhes?",
  msg2Horas: 24,
  msg3: "Olá {{nome}}, última tentativa por aqui! Se preferir, me avise um melhor horário pra falarmos.",
  msg3Horas: 72,
};

function FollowupSection({ campanhas }: { campanhas: Campanha[] }) {
  const [configs, setConfigs] = useState<Record<string, FollowupConfig>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const getConfig = (id: string) => configs[id] ?? DEFAULT_FOLLOWUP;
  const updateConfig = (id: string, patch: Partial<FollowupConfig>) =>
    setConfigs((prev) => ({ ...prev, [id]: { ...getConfig(id), ...patch } }));

  const sequenciasAtivas = campanhas.filter((c) => getConfig(c.id).ativo).length;
  // Dados ilustrativos para o resumo (UI-only)
  const enviadasHoje = sequenciasAtivas * 12;
  const taxaResposta = sequenciasAtivas > 0 ? 23 : 0;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Repeat className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Sequência de Follow-up</h2>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <ResumoCard icon={<Repeat className="h-4 w-4" />} label="Sequências ativas" value={String(sequenciasAtivas)} />
        <ResumoCard icon={<MessageSquare className="h-4 w-4" />} label="Mensagens enviadas hoje" value={String(enviadasHoje)} />
        <ResumoCard icon={<TrendingUp className="h-4 w-4" />} label="Taxa de resposta do follow-up" value={`${taxaResposta}%`} />
      </div>

      {campanhas.length === 0 ? (
        <div className="rounded-xl border border-solid border-border p-6 text-center text-sm text-muted-foreground">
          Crie uma campanha para configurar a sequência de follow-up.
        </div>
      ) : (
        <div className="space-y-2">
          {campanhas.map((c) => {
            const cfg = getConfig(c.id);
            const aberto = openId === c.id;
            return (
              <div key={c.id} className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between gap-3 p-4">
                  <button
                    className="text-left min-w-0 flex-1"
                    onClick={() => setOpenId(aberto ? null : c.id)}
                  >
                    <div className="font-medium truncate">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {cfg.ativo ? "Follow-up automático ativado" : "Follow-up automático desativado"}
                    </div>
                  </button>
                  <Badge className={cfg.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}>
                    {cfg.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                  <Switch
                    checked={cfg.ativo}
                    onCheckedChange={(v) => updateConfig(c.id, { ativo: v })}
                  />
                </div>

                {aberto && (
                  <div className="border-t border-border p-4 space-y-4">
                    <EtapaFollowup
                      titulo="Mensagem 1"
                      quando="Imediata"
                      ativa={cfg.ativo}
                      value={cfg.msg1}
                      onChange={(v) => updateConfig(c.id, { msg1: v })}
                    />
                    <EtapaFollowup
                      titulo="Mensagem 2"
                      quando={`Após ${cfg.msg2Horas}h`}
                      ativa={cfg.ativo}
                      value={cfg.msg2}
                      onChange={(v) => updateConfig(c.id, { msg2: v })}
                      horas={cfg.msg2Horas}
                      onHorasChange={(h) => updateConfig(c.id, { msg2Horas: h })}
                    />
                    <EtapaFollowup
                      titulo="Mensagem 3"
                      quando={`Após ${cfg.msg3Horas}h`}
                      ativa={cfg.ativo}
                      value={cfg.msg3}
                      onChange={(v) => updateConfig(c.id, { msg3: v })}
                      horas={cfg.msg3Horas}
                      onHorasChange={(h) => updateConfig(c.id, { msg3Horas: h })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ResumoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function EtapaFollowup({
  titulo, quando, ativa, value, onChange, horas, onHorasChange,
}: {
  titulo: string;
  quando: string;
  ativa: boolean;
  value: string;
  onChange: (v: string) => void;
  horas?: number;
  onHorasChange?: (h: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3 bg-muted/20">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{titulo}</div>
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {quando}
          </div>
        </div>
        <Badge className={ativa ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}>
          {ativa ? "Ativa" : "Inativa"}
        </Badge>
      </div>
      {onHorasChange && (
        <div className="flex items-center gap-2 mb-2">
          <Label className="text-xs">Disparar após</Label>
          <Input
            type="number"
            min={1}
            max={720}
            value={horas ?? 0}
            onChange={(e) => onHorasChange(Number(e.target.value))}
            className="h-8 w-24"
          />
          <span className="text-xs text-muted-foreground">horas</span>
        </div>
      )}
      <Textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Mensagem do follow-up…"
        disabled={!ativa}
      />
    </div>
  );
}


// ============================================================================
// Painel da fila: mostra, por campanha em andamento, quantos leads estão na
// fila, quanto do limitePorHora já foi consumido nos últimos 60 min, e como o
// intervalo mínimo + o tick do cron impactam o próximo envio estimado.
// ============================================================================

const CRON_TICK_MS_PANEL = 60_000;

function calcularProximoEnvio(c: Campanha, now: number) {
  const intervaloSeg = Math.max(1, Math.floor(3600 / Math.max(1, c.limitePorHora)));
  const intervaloMs = intervaloSeg * 1000;
  const permitidoAt = (c.lastSentAt ?? 0) + intervaloMs;
  const alvo = Math.max(permitidoAt, now);
  const proximoTickAt = Math.ceil(alvo / CRON_TICK_MS_PANEL) * CRON_TICK_MS_PANEL;
  return {
    intervaloSeg,
    intervaloMs,
    permitidoAt,
    proximoTickAt,
    proximoEm: Math.max(0, proximoTickAt - now),
    limitadoPorCron: permitidoAt <= now,
  };
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return "agora";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

function PainelFilaCampanhas({ campanhas }: { campanhas: Campanha[] }) {
  const [aberto, setAberto] = useState(true);
  const [tick, setTick] = useState(0);

  // Ativa/agendada com pendentes — únicas relevantes para o painel.
  const relevantes = useMemo(
    () =>
      campanhas.filter(
        (c) =>
          (c.status === "em_andamento" || c.status === "agendada") &&
          c.items.some((it) => it.status === "pendente"),
      ),
    [campanhas],
  );

  useEffect(() => {
    if (!aberto || relevantes.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [aberto, relevantes.length]);

  // `tick` só existe para forçar re-render do countdown a cada segundo.
  void tick;

  if (campanhas.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card">
      <button
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Painel da fila
          </div>
          <div className="text-xs text-muted-foreground">
            Fila pendente por campanha, consumo do limite/hora e próximo envio estimado (respeitando cron de ~60s).
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{aberto ? "ocultar" : "mostrar"}</span>
      </button>

      {aberto && (
        <div className="border-t border-border p-4">
          {relevantes.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Nenhuma campanha em andamento com leads pendentes no momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-medium py-2 pr-3">Campanha</th>
                    <th className="text-left font-medium py-2 pr-3">Fila</th>
                    <th className="text-left font-medium py-2 pr-3">Limite/h</th>
                    <th className="text-left font-medium py-2 pr-3">Intervalo</th>
                    <th className="text-left font-medium py-2 pr-3">Próximo envio</th>
                    <th className="text-left font-medium py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {relevantes.map((c) => (
                    <PainelLinha key={c.id} campanha={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PainelLinha({ campanha: c }: { campanha: Campanha }) {
  const now = Date.now();
  const total = c.items.length;
  const pendentes = c.items.filter((it) => it.status === "pendente").length;
  const enviados = c.items.filter((it) => it.status === "enviado").length;
  const restantes = total - enviados;
  const inicio = now - 3600_000;
  const enviadosUltimaHora = c.items.filter(
    (it) => it.status === "enviado" && (it.sentAt ?? 0) >= inicio,
  ).length;
  const consumoPct = Math.min(
    100,
    Math.round((enviadosUltimaHora / Math.max(1, c.limitePorHora)) * 100),
  );

  const { intervaloSeg, proximoTickAt, proximoEm, limitadoPorCron, permitidoAt } =
    calcularProximoEnvio(c, now);

  const emLimite = enviadosUltimaHora >= c.limitePorHora;

  let motivo = "";
  let motivoCls = "text-muted-foreground";
  if (c.status === "agendada" && c.agendamento && c.agendamento > now) {
    motivo = `Aguardando início agendado (${fmtCountdown(c.agendamento - now)})`;
    motivoCls = "text-info";
  } else if (emLimite) {
    const reset = permitidoAt > now ? new Date(permitidoAt).toLocaleTimeString("pt-BR") : "—";
    motivo = `Limite de ${c.limitePorHora}/h atingido. Libera em ${reset}.`;
    motivoCls = "text-destructive";
  } else if (limitadoPorCron) {
    motivo = `Intervalo já venceu. Aguardando próximo tick do cron (~60s).`;
    motivoCls = "text-warning";
  } else {
    motivo = `Respeitando intervalo mínimo de ${intervaloSeg}s + tick do cron.`;
    motivoCls = "text-info";
  }

  const barraCor =
    consumoPct >= 100
      ? "bg-destructive"
      : consumoPct >= 80
        ? "bg-warning"
        : "bg-primary";

  return (
    <tr className="align-top">
      <td className="py-2 pr-3">
        <div className="font-medium truncate max-w-[220px]">{c.nome}</div>
        <div className="text-[10px] text-muted-foreground">
          {enviados}/{total} enviados · {restantes} restantes
        </div>
      </td>
      <td className="py-2 pr-3 tabular-nums">
        <span className="rounded bg-muted px-1.5 py-0.5">{pendentes}</span>
      </td>
      <td className="py-2 pr-3 min-w-[140px]">
        <div className="flex items-center gap-2 tabular-nums">
          <span>
            {enviadosUltimaHora}/{c.limitePorHora}
          </span>
          <span className="text-[10px] text-muted-foreground">últ. 60 min</span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${barraCor}`} style={{ width: `${consumoPct}%` }} />
        </div>
      </td>
      <td className="py-2 pr-3 tabular-nums">
        <div>1 a cada {intervaloSeg}s</div>
        <div className="text-[10px] text-muted-foreground">
          teto teórico: {c.limitePorHora}/h
        </div>
      </td>
      <td className="py-2 pr-3 tabular-nums">
        <div className="font-medium">{fmtCountdown(proximoEm)}</div>
        <div className="text-[10px] text-muted-foreground">
          {new Date(proximoTickAt).toLocaleTimeString("pt-BR")}
        </div>
      </td>
      <td className={`py-2 text-[11px] ${motivoCls}`}>{motivo}</td>
    </tr>
  );
}


// carrega um `motivo` explicando por que a campanha não avançou naquele tick.
const RESULTADO_OK = new Set([
  "enviado",
  "enviado_e_concluida",
  "concluida",
  "iniciada_agendada",
]);

// Rótulos amigáveis por resultado — mantém a UI legível sem perder o código bruto.
const RESULTADO_LABEL: Record<string, string> = {
  aguardando_intervalo: "Aguardando intervalo/hora",
  aguardando_retry: "Aguardando nova tentativa",
  pausada_sem_whatsapp: "Pausada: WhatsApp desconectado",
  pausada_auth: "Pausada: falha de autenticação",
  pausada_rate_limit: "Pausada: rate limit",
  sem_numero: "Lead sem número válido",
  ja_prospectado: "Lead já prospectado",
};

function labelResultado(r: string) {
  return RESULTADO_LABEL[r] ?? r.replace(/_/g, " ");
}

function TrilhaExecucoes() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [somenteMeus, setSomenteMeus] = useState(true);
  const [somenteProblemas, setSomenteProblemas] = useState(true);
  const list = useServerFn(listCronRunsRemote);
  const { data: runs, refetch, isFetching } = useQuery({
    queryKey: ["cron-runs"],
    queryFn: () => list({ data: { limit: 50 } }),
    enabled: open,
    refetchInterval: open ? 30_000 : false,
    staleTime: 10_000,
  });

  const filtered = useMemo(() => {
    if (!runs) return [];
    const meuId = user?.id;
    return runs
      .map((r) => {
        const detalhes: CronRunDetalhe[] = Array.isArray(r.detalhes)
          ? (r.detalhes as CronRunDetalhe[])
          : [];
        const visiveis = detalhes.filter((d) => {
          if (somenteMeus && meuId && d.userId && d.userId !== meuId) return false;
          if (somenteProblemas && RESULTADO_OK.has(d.resultado)) return false;
          return true;
        });
        return { run: r, detalhes, visiveis };
      })
      .filter(({ run, visiveis }) => {
        // Se filtramos por "problemas", esconde runs que não têm nada de interesse
        // para este usuário (nem falhas visíveis, nem erro global do run).
        if (somenteProblemas && visiveis.length === 0 && run.ok && run.erros === 0) {
          return false;
        }
        return true;
      });
  }, [runs, user?.id, somenteMeus, somenteProblemas]);

  return (
    <div className="mt-8 rounded-2xl border border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <div>
          <div className="text-sm font-semibold">Trilha de execuções do servidor</div>
          <div className="text-xs text-muted-foreground">
            Cada tick do cron (~1 min): quantas campanhas foram consideradas, leads selecionados e mensagens enviadas.
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "ocultar" : "mostrar"}</span>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2">
                <Switch checked={somenteMeus} onCheckedChange={setSomenteMeus} />
                <span>Somente minhas campanhas</span>
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={somenteProblemas} onCheckedChange={setSomenteProblemas} />
                <span>Somente com falha ou atraso</span>
              </label>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Atualizando…" : "Atualizar"}
            </Button>
          </div>
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              {runs && runs.length > 0
                ? "Nenhuma execução corresponde aos filtros atuais."
                : "Nenhuma execução registrada ainda."}
            </div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto">
              {filtered.map(({ run, detalhes, visiveis }) => (
                <CronRunRow
                  key={run.id}
                  run={run}
                  detalhesTotais={detalhes.length}
                  detalhesVisiveis={visiveis}
                  filtroAtivo={somenteMeus || somenteProblemas}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type CronRunRow = {
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

function CronRunRow({
  run,
  detalhesTotais,
  detalhesVisiveis,
  filtroAtivo,
}: {
  run: CronRunRow;
  detalhesTotais: number;
  detalhesVisiveis: CronRunDetalhe[];
  filtroAtivo: boolean;
}) {
  const [expand, setExpand] = useState(true);
  const started = new Date(run.started_at);
  const problemas = detalhesVisiveis.filter((d) => !RESULTADO_OK.has(d.resultado));

  return (
    <div className={`rounded-lg border ${run.ok ? "border-border" : "border-destructive/60"} bg-muted/20`}>
      <button
        onClick={() => setExpand((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left text-xs"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums font-medium">{started.toLocaleString("pt-BR")}</span>
          <span className="text-muted-foreground">· {run.duration_ms ?? "?"}ms</span>
          <span className="rounded bg-muted px-1.5 py-0.5">
            {filtroAtivo ? `mostradas: ${detalhesVisiveis.length}/${detalhesTotais}` : `entradas: ${detalhesTotais}`}
          </span>
          {problemas.length > 0 && (
            <span className="rounded bg-warning/15 text-warning px-1.5 py-0.5">
              com falha/atraso: {problemas.length}
            </span>
          )}
          {run.erros > 0 && <span className="rounded bg-destructive/15 text-destructive px-1.5 py-0.5">erros: {run.erros}</span>}
          {!run.ok && <span className="rounded bg-destructive/15 text-destructive px-1.5 py-0.5">falhou</span>}
        </div>
        <span className="text-muted-foreground">{expand ? "−" : "+"}</span>
      </button>
      {expand && (
        <div className="border-t border-border p-3 space-y-1.5 text-xs">
          {run.error_message && (
            <div className="text-destructive/80 text-[11px] break-words">Erro do run: {run.error_message}</div>
          )}
          {detalhesVisiveis.length === 0 ? (
            <div className="text-muted-foreground">
              {detalhesTotais === 0
                ? "Nenhuma campanha considerada neste tick."
                : "Nada a mostrar neste tick com os filtros atuais."}
            </div>
          ) : (
            detalhesVisiveis.map((d, i) => {
              const isOk = RESULTADO_OK.has(d.resultado);
              return (
                <div
                  key={i}
                  className={`rounded border px-2 py-1.5 flex flex-col gap-0.5 ${
                    isOk
                      ? "border-border bg-background"
                      : "border-warning/40 bg-warning/5"
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
                    <span className="font-medium truncate max-w-[240px]" title={d.nome ?? d.campanhaId}>
                      {d.nome ?? d.campanhaId}
                    </span>
                    {d.pendentesAntes != null && (
                      <span className="text-muted-foreground">· pendentes: {d.pendentesAntes}</span>
                    )}
                    {d.leadId && (
                      <span className="text-muted-foreground">· lead: {d.leadId.slice(0, 8)}…</span>
                    )}
                  </div>
                  {d.motivo && (
                    <div className="text-muted-foreground break-words">
                      Motivo: {d.motivo}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

