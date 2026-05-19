import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Plus, Send, Clock, Play, Pause, Trash2, Users, CalendarClock, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useStore, type Campanha, type CampanhaStatus, type CampanhaItem } from "@/store/app-store";
import { renderTemplate } from "@/data/templates";

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
  const { campanhas, deleteCampanha, setCampanhaStatus, markCampanhaItemEnviado, leads, templates } = useStore();
  const [detalheId, setDetalheId] = useState<string | null>(null);

  // Motor de disparo: a cada 2s checa se há campanha em_andamento pronta para enviar próximo item
  useEffect(() => {
    const tick = setInterval(() => {
      const now = Date.now();
      campanhas.forEach((c) => {
        // Auto-iniciar agendadas que chegaram na hora
        if (c.status === "agendada" && c.agendamento && c.agendamento <= now) {
          setCampanhaStatus(c.id, "em_andamento");
          toast.info(`Campanha "${c.nome}" iniciada automaticamente`);
          return;
        }
        if (c.status !== "em_andamento") return;
        const intervaloMs = Math.max(1, Math.floor(3600_000 / c.limitePorHora));
        const podeEnviar = !c.lastSentAt || (now - c.lastSentAt) >= intervaloMs;
        if (!podeEnviar) return;
        const proximo = c.items.find((it) => it.status === "pendente");
        if (!proximo) {
          setCampanhaStatus(c.id, "concluida");
          return;
        }
        const lead = leads.find((l) => l.id === proximo.leadId);
        if (!lead) { markCampanhaItemEnviado(c.id, proximo.leadId); return; }
        const tpl = templates.find((t) => t.id === c.templateId);
        const texto = renderTemplate(c.mensagemOverride || tpl?.mensagem || "", {
          nome: lead.nome, cidade: lead.cidade, nicho: lead.nicho, avaliacao: lead.avaliacao,
          telefone: lead.telefone, endereco: lead.endereco,
        });
        const fone = lead.telefone.replace(/\D/g, "");
        const url = `https://wa.me/55${fone}?text=${encodeURIComponent(texto)}`;
        const win = window.open(url, "_blank", "noopener");
        if (!win) {
          toast.error("Pop-up bloqueado. Permita pop-ups para disparar a campanha.");
          setCampanhaStatus(c.id, "pausada");
          return;
        }
        markCampanhaItemEnviado(c.id, proximo.leadId);
      });
    }, 2000);
    return () => clearInterval(tick);
  }, [campanhas, leads, templates, setCampanhaStatus, markCampanhaItemEnviado]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader title="Campanhas" subtitle="Crie listas segmentadas, agende e dispare no WhatsApp respeitando um limite por hora.">
        <NovaCampanhaDialog />
      </PageHeader>

      {campanhas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
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
              onAbrir={() => setDetalheId(c.id)}
              onStart={() => setCampanhaStatus(c.id, "em_andamento")}
              onPause={() => setCampanhaStatus(c.id, "pausada")}
              onDelete={() => { if (confirm("Excluir esta campanha?")) deleteCampanha(c.id); }}
            />
          ))}
        </div>
      )}

      {detalheId && (
        <CampanhaDetalheDialog
          campanha={campanhas.find((c) => c.id === detalheId)!}
          onClose={() => setDetalheId(null)}
        />
      )}
    </div>
  );
}

function CampanhaCard({ campanha: c, onAbrir, onStart, onPause, onDelete }: {
  campanha: Campanha; onAbrir: () => void; onStart: () => void; onPause: () => void; onDelete: () => void;
}) {
  const total = c.items.length;
  const enviados = c.items.filter((it) => it.status === "enviado").length;
  const pct = total > 0 ? Math.round((enviados / total) * 100) : 0;
  const intervaloSeg = Math.floor(3600 / c.limitePorHora);

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

  const destinatarios = useMemo(() => {
    return leads.filter((l) => {
      if (apenasStatusNovo && l.status !== "novo") return false;
      if (apenasSemSite && l.site) return false;
      if (filtroNicho && !l.nicho.toLowerCase().includes(filtroNicho.toLowerCase())) return false;
      if (filtroCidade && !l.cidade.toLowerCase().includes(filtroCidade.toLowerCase())) return false;
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

  const handleCreate = () => {
    if (!nome.trim()) return toast.error("Dê um nome para a campanha");
    if (destinatarios.length === 0) return toast.error("Nenhum lead corresponde aos filtros");
    const items: CampanhaItem[] = destinatarios.map((l) => ({ leadId: l.id, status: "pendente" }));
    const agendamento = agendarPara ? new Date(agendarPara).getTime() : undefined;
    createCampanha({
      nome: nome.trim(), templateId, mensagemOverride: mensagemOverride.trim() || undefined,
      filtroNicho, filtroCidade, apenasSemSite, apenasStatusNovo, limitePorHora, agendamento, items,
    });
    toast.success(`Campanha criada com ${destinatarios.length} destinatários`);
    setOpen(false);
    setNome(""); setMensagemOverride(""); setFiltroNicho(""); setFiltroCidade(""); setAgendarPara("");
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
                return (
                  <div key={it.leadId} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{lead?.nome ?? "(lead removido)"}</div>
                      <div className="text-xs text-muted-foreground truncate">{lead?.telefone}</div>
                    </div>
                    {it.status === "enviado" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" /> {it.sentAt ? new Date(it.sentAt).toLocaleTimeString("pt-BR") : "enviado"}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">pendente</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
