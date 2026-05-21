import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listSequencias,
  upsertSequencia,
  deleteSequencia,
  listExecucoes,
  atualizarExecucao,
  processarVencidos,
  type SequenciaRow,
  type SequenciaEtapa,
  type ExecucaoRow,
} from "@/lib/sequencias.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pause, Play, X, Clock, CheckCircle2, AlertTriangle, MessageCircle, ArrowDown, BarChart3 } from "lucide-react";
import { usePlano } from "@/store/app-store";
import { UpgradeModal } from "@/components/upgrade-modal";

export const Route = createFileRoute("/app/sequencias")({
  head: () => ({ meta: [{ title: "Sequências de Follow-up — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SequenciasPage,
});

const LIMITES = {
  free: { sequencias: 1, etapas: 3, leadsAtivos: 5 },
  pro: { sequencias: 20, etapas: 10, leadsAtivos: 200 },
  agencia: { sequencias: 999, etapas: 20, leadsAtivos: 9999 },
};

function SequenciasPage() {
  const plano = usePlano();
  const limites = LIMITES[plano.id];
  const qc = useQueryClient();

  const listSeqs = useServerFn(listSequencias);
  const listExecs = useServerFn(listExecucoes);
  const processar = useServerFn(processarVencidos);
  const atualizar = useServerFn(atualizarExecucao);

  const { data: seqData } = useQuery({ queryKey: ["sequencias"], queryFn: () => listSeqs() });
  const { data: execData } = useQuery({ queryKey: ["execucoes"], queryFn: () => listExecs() });

  const sequencias = seqData?.sequencias ?? [];
  const execucoes = execData?.execucoes ?? [];

  // Motor: roda no mount e a cada 60s
  useEffect(() => {
    const tick = async () => {
      try {
        const r = await processar();
        if (r.enviadas > 0) {
          toast.success(`${r.enviadas} follow-up${r.enviadas > 1 ? "s" : ""} enviado${r.enviadas > 1 ? "s" : ""}`);
          qc.invalidateQueries({ queryKey: ["execucoes"] });
        }
      } catch (e) {
        console.warn("processar vencidos:", e);
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [processar, qc]);

  const [editor, setEditor] = useState<SequenciaRow | "novo" | null>(null);
  const [metricas, setMetricas] = useState<SequenciaRow | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState<{ titulo: string; descricao: string } | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const ativasCount = execucoes.filter((e) => !e.cancelada && !e.concluida).length;
  const selecionaveis = execucoes.filter((e) => !e.cancelada && !e.concluida);
  const toggleSel = (id: string) => {
    const novo = new Set(selecionados);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    setSelecionados(novo);
  };
  const toggleSelAll = () => {
    if (selecionados.size === selecionaveis.length) setSelecionados(new Set());
    else setSelecionados(new Set(selecionaveis.map((e) => e.id)));
  };
  const bulkAcao = async (acao: "pausar" | "retomar" | "cancelar") => {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    if (acao === "cancelar" && !confirm(`Cancelar ${ids.length} execução(ões)?`)) return;
    try {
      await atualizar({ data: { ids, acao } });
      toast.success(`${ids.length} execução(ões) ${acao === "pausar" ? "pausada(s)" : acao === "retomar" ? "retomada(s)" : "cancelada(s)"}`);
      setSelecionados(new Set());
      qc.invalidateQueries({ queryKey: ["execucoes"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na ação em lote");
    }
  };

  const abrirNova = () => {
    if (sequencias.length >= limites.sequencias) {
      setUpgradeOpen({
        titulo: "Limite de sequências atingido",
        descricao: `Seu plano permite ${limites.sequencias} sequência${limites.sequencias > 1 ? "s" : ""}. Faça upgrade para criar mais.`,
      });
      return;
    }
    setEditor("novo");
  };

  const statusBadge = (e: ExecucaoRow) => {
    if (e.cancelada) return <Badge variant="destructive">Cancelada</Badge>;
    if (e.parada_por_resposta) return <Badge className="bg-purple-500/15 text-purple-400 hover:bg-purple-500/15">🎉 Respondeu</Badge>;
    if (e.concluida) return <Badge variant="secondary">Concluída</Badge>;
    if (e.pausada) return <Badge className="bg-warning/15 text-warning hover:bg-warning/15">Pausada</Badge>;
    return <Badge className="bg-success/15 text-success hover:bg-success/15">Ativa</Badge>;
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 pt-16 md:pt-10 max-w-[1400px] mx-auto">
      <PageHeader
        title="Sequências de Follow-up"
        subtitle={`${sequencias.length} sequência${sequencias.length !== 1 ? "s" : ""} · ${ativasCount} lead${ativasCount !== 1 ? "s" : ""} em cadência`}
      >
        <Button onClick={abrirNova}>
          <Plus className="h-4 w-4" /> Nova sequência
        </Button>
      </PageHeader>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {sequencias.map((s) => {
          const ativos = execucoes.filter((e) => e.sequencia_id === s.id && !e.cancelada && !e.concluida).length;
          const enviadas = execucoes
            .filter((e) => e.sequencia_id === s.id)
            .reduce((acc, e) => acc + e.etapas.filter((et) => et.status === "enviada").length, 0);
          return (
            <Card key={s.id} className="p-4 bg-gradient-card border-border hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setEditor(s)}>
                  <div className="font-medium truncate">{s.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.etapas.length} etapas · {s.objetivo.replace("_", " ")}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); setMetricas(s); }} title="Métricas">
                  <BarChart3 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-center cursor-pointer" onClick={() => setEditor(s)}>
                <div className="rounded-md bg-secondary/30 py-2">
                  <div className="text-lg font-semibold tabular-nums">{ativos}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Ativos</div>
                </div>
                <div className="rounded-md bg-secondary/30 py-2">
                  <div className="text-lg font-semibold tabular-nums">{enviadas}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Enviadas</div>
                </div>
              </div>
            </Card>
          );
        })}
        {sequencias.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground col-span-full">
            Nenhuma sequência ainda. Clique em <strong>Nova sequência</strong> para criar a primeira.
          </Card>
        )}
      </div>

      <Card className="p-4 bg-gradient-card border-border">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="font-medium">Leads em sequência</div>
          {selecionados.size > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}</span>
              <Button size="sm" variant="outline" onClick={() => bulkAcao("pausar")}><Pause className="h-3 w-3" /> Pausar</Button>
              <Button size="sm" variant="outline" onClick={() => bulkAcao("retomar")}><Play className="h-3 w-3" /> Retomar</Button>
              <Button size="sm" variant="outline" onClick={() => bulkAcao("cancelar")}><X className="h-3 w-3" /> Cancelar</Button>
            </div>
          )}
        </div>
        {execucoes.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Nenhum lead em sequência. Vá em <strong>Meus leads</strong> e clique em "Iniciar sequência".</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="py-2 px-2 w-8">
                    <Checkbox
                      checked={selecionaveis.length > 0 && selecionados.size === selecionaveis.length}
                      onCheckedChange={toggleSelAll}
                    />
                  </th>
                  <th className="py-2 px-2">Sequência</th>
                  <th className="py-2 px-2">Etapa</th>
                  <th className="py-2 px-2">Próximo envio</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {execucoes.map((e) => {
                  const seq = sequencias.find((s) => s.id === e.sequencia_id);
                  const prox = e.etapas.find((et) => et.status === "pendente");
                  const enviadas = e.etapas.filter((et) => et.status === "enviada").length;
                  const ativo = !e.concluida && !e.cancelada;
                  return (
                    <tr key={e.id} className="border-t border-border">
                      <td className="py-2 px-2">
                        {ativo && (
                          <Checkbox
                            checked={selecionados.has(e.id)}
                            onCheckedChange={() => toggleSel(e.id)}
                          />
                        )}
                      </td>
                      <td className="py-2 px-2">{seq?.nome ?? "—"}</td>
                      <td className="py-2 px-2 tabular-nums">{enviadas}/{e.etapas.length}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {prox ? new Date(prox.agendada_para).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="py-2 px-2">{statusBadge(e)}</td>
                      <td className="py-2 px-2 text-right">
                        {ativo && (
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await atualizar({ data: { ids: [e.id], acao: e.pausada ? "retomar" : "pausar" } });
                                qc.invalidateQueries({ queryKey: ["execucoes"] });
                              }}
                            >
                              {e.pausada ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                if (!confirm("Cancelar essa sequência para este lead?")) return;
                                await atualizar({ data: { ids: [e.id], acao: "cancelar" } });
                                qc.invalidateQueries({ queryKey: ["execucoes"] });
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
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

      {metricas && (
        <MetricasModal
          sequencia={metricas}
          execucoes={execucoes.filter((e) => e.sequencia_id === metricas.id)}
          onClose={() => setMetricas(null)}
        />
      )}


      {editor && (
        <SequenciaEditor
          sequencia={editor === "novo" ? null : editor}
          maxEtapas={limites.etapas}
          onUpgrade={(t, d) => setUpgradeOpen({ titulo: t, descricao: d })}
          onClose={() => setEditor(null)}
        />
      )}

      <UpgradeModal
        open={!!upgradeOpen}
        onOpenChange={(v) => !v && setUpgradeOpen(null)}
        titulo={upgradeOpen?.titulo ?? ""}
        descricao={upgradeOpen?.descricao ?? ""}
      />
    </div>
  );
}

function SequenciaEditor({
  sequencia,
  maxEtapas,
  onUpgrade,
  onClose,
}: {
  sequencia: SequenciaRow | null;
  maxEtapas: number;
  onUpgrade: (t: string, d: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertSequencia);
  const del = useServerFn(deleteSequencia);

  const [nome, setNome] = useState(sequencia?.nome ?? "");
  const [objetivo, setObjetivo] = useState(sequencia?.objetivo ?? "outro");
  const [pararResp, setPararResp] = useState(sequencia?.parar_ao_responder ?? true);
  const [pararFechar, setPararFechar] = useState(sequencia?.parar_ao_fechar ?? true);
  const [pararCrm, setPararCrm] = useState(sequencia?.parar_ao_mover_crm ?? false);
  const [etapas, setEtapas] = useState<SequenciaEtapa[]>(
    sequencia?.etapas ?? [{ ordem: 1, intervalo: 0, unidade: "horas", mensagem: "" }],
  );

  const addEtapa = () => {
    if (etapas.length >= maxEtapas) {
      onUpgrade("Limite de etapas atingido", `Seu plano permite ${maxEtapas} etapas por sequência.`);
      return;
    }
    setEtapas([...etapas, { ordem: etapas.length + 1, intervalo: 3, unidade: "dias", mensagem: "" }]);
  };

  const removerEtapa = (idx: number) => {
    const nova = etapas.filter((_, i) => i !== idx).map((e, i) => ({ ...e, ordem: i + 1 }));
    setEtapas(nova);
  };

  const updateEtapa = (idx: number, patch: Partial<SequenciaEtapa>) => {
    setEtapas(etapas.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const salvar = async () => {
    if (!nome.trim()) return toast.error("Dê um nome à sequência");
    if (etapas.some((e) => !e.mensagem.trim())) return toast.error("Todas as etapas precisam de mensagem");
    try {
      await upsert({
        data: {
          id: sequencia?.id,
          nome: nome.trim(),
          objetivo: objetivo as "outro",
          ativa: true,
          parar_ao_responder: pararResp,
          parar_ao_fechar: pararFechar,
          parar_ao_mover_crm: pararCrm,
          etapas,
        },
      });
      toast.success(sequencia ? "Sequência atualizada" : "Sequência criada");
      qc.invalidateQueries({ queryKey: ["sequencias"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    }
  };

  const remover = async () => {
    if (!sequencia) return;
    if (!confirm("Excluir essa sequência? Execuções em andamento serão removidas.")) return;
    await del({ data: { id: sequencia.id } });
    toast.success("Sequência removida");
    qc.invalidateQueries({ queryKey: ["sequencias"] });
    qc.invalidateQueries({ queryKey: ["execucoes"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sequencia ? "Editar sequência" : "Nova sequência"}</DialogTitle>
          <DialogDescription>Configure as etapas e os intervalos entre os envios.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Abordagem para clínicas" />
          </div>

          <div>
            <Label>Objetivo</Label>
            <Select value={objetivo} onValueChange={setObjetivo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vender_site">Vender site</SelectItem>
                <SelectItem value="vender_automacao">Vender automação</SelectItem>
                <SelectItem value="reuniao">Marcar reunião</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Parar sequência quando:</Label>
            <div className="flex items-center gap-2 text-sm">
              <Checkbox checked={pararResp} onCheckedChange={(v) => setPararResp(!!v)} id="p1" />
              <label htmlFor="p1">Lead responder qualquer mensagem</label>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Checkbox checked={pararFechar} onCheckedChange={(v) => setPararFechar(!!v)} id="p2" />
              <label htmlFor="p2">Lead for marcado como "Fechado" ou "Perdido"</label>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Checkbox checked={pararCrm} onCheckedChange={(v) => setPararCrm(!!v)} id="p3" />
              <label htmlFor="p3">Lead for movido no CRM</label>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Etapas</Label>
            {etapas.map((e, idx) => (
              <div key={idx}>
                <Card className="p-3 bg-secondary/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-muted-foreground">ETAPA {e.ordem}</div>
                    {etapas.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removerEtapa(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {idx === 0 ? (
                    <div className="text-xs text-muted-foreground mb-2">Enviada imediatamente após iniciar</div>
                  ) : (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-muted-foreground">Aguardar</span>
                      <Input
                        type="number"
                        min={0}
                        value={e.intervalo}
                        onChange={(ev) => updateEtapa(idx, { intervalo: Number(ev.target.value) || 0 })}
                        className="w-20 h-8"
                      />
                      <Select value={e.unidade} onValueChange={(v) => updateEtapa(idx, { unidade: v as "horas" | "dias" })}>
                        <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="horas">horas</SelectItem>
                          <SelectItem value="dias">dias</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">após a anterior</span>
                    </div>
                  )}
                  <Textarea
                    value={e.mensagem}
                    onChange={(ev) => updateEtapa(idx, { mensagem: ev.target.value })}
                    placeholder="Olá {{nome}}! Vi a {{empresa}} em {{cidade}}..."
                    rows={3}
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Variáveis: <code>{"{{nome}}"}</code> <code>{"{{cidade}}"}</code> <code>{"{{nicho}}"}</code> <code>{"{{telefone}}"}</code>
                  </div>
                </Card>
                {idx < etapas.length - 1 && (
                  <div className="flex justify-center my-1 text-muted-foreground">
                    <ArrowDown className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addEtapa} className="w-full">
              <Plus className="h-3 w-3" /> Adicionar etapa
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {sequencia && (
            <Button variant="destructive" onClick={remover} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Salvar sequência</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricasModal({
  sequencia,
  execucoes,
  onClose,
}: {
  sequencia: SequenciaRow;
  execucoes: ExecucaoRow[];
  onClose: () => void;
}) {
  const total = execucoes.length;
  const ativas = execucoes.filter((e) => !e.cancelada && !e.concluida).length;
  const responderam = execucoes.filter((e) => e.parada_por_resposta).length;
  const concluidas = execucoes.filter((e) => e.concluida).length;
  const taxaResposta = total > 0 ? (responderam / total) * 100 : 0;

  const porEtapa = sequencia.etapas
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((etDef) => {
      let enviadas = 0;
      let falhas = 0;
      let pendentes = 0;
      for (const ex of execucoes) {
        const et = ex.etapas.find((e) => e.ordem === etDef.ordem);
        if (!et) continue;
        if (et.status === "enviada") enviadas++;
        else if (et.status === "falha") falhas++;
        else pendentes++;
      }
      const taxa = total > 0 ? (enviadas / total) * 100 : 0;
      return { ordem: etDef.ordem, mensagem: etDef.mensagem, enviadas, falhas, pendentes, taxa };
    });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Métricas · {sequencia.nome}</DialogTitle>
          <DialogDescription>Desempenho agregado por etapa</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <Card className="p-3 text-center bg-secondary/30">
            <div className="text-xl font-semibold tabular-nums">{total}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Leads</div>
          </Card>
          <Card className="p-3 text-center bg-secondary/30">
            <div className="text-xl font-semibold tabular-nums">{ativas}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Em cadência</div>
          </Card>
          <Card className="p-3 text-center bg-secondary/30">
            <div className="text-xl font-semibold tabular-nums">{concluidas}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Concluídas</div>
          </Card>
          <Card className="p-3 text-center bg-purple-500/10">
            <div className="text-xl font-semibold tabular-nums text-purple-400">{taxaResposta.toFixed(1)}%</div>
            <div className="text-[10px] text-muted-foreground uppercase">Taxa resposta</div>
          </Card>
        </div>

        <div className="space-y-2">
          {porEtapa.map((et) => (
            <Card key={et.ordem} className="p-3 bg-secondary/20">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-semibold text-muted-foreground">ETAPA {et.ordem}</div>
                <div className="text-xs tabular-nums">
                  <span className="text-success">{et.enviadas} enviadas</span>
                  {et.falhas > 0 && <span className="text-destructive ml-2">{et.falhas} falhas</span>}
                  {et.pendentes > 0 && <span className="text-muted-foreground ml-2">{et.pendentes} pend.</span>}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mb-2 line-clamp-2">{et.mensagem}</div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${et.taxa}%` }} />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">{et.taxa.toFixed(0)}% enviada</div>
            </Card>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
