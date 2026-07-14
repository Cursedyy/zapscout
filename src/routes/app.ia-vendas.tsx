import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getIaConfig,
  salvarIaConfig,
  listarIaQAs,
  upsertIaQA,
  deletarIaQA,
  listarConversasIa,
  definirIaAtivaLead,
  enviarMensagemManual,
  processarMensagemLead,
  listarEscalonamentos,
  marcarEscalonamentoLido,
  type IaConfig,
  type IaConversa,
} from "@/lib/ia.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bot,
  Plus,
  Trash2,
  MessageCircle,
  Send,
  AlertTriangle,
  Sparkles,
  ArrowLeft,
  Lock,
} from "lucide-react";
import { usePlano } from "@/store/app-store";
import { UpgradeModal } from "@/components/upgrade-modal";

export const Route = createFileRoute("/app/ia-vendas")({
  head: () => ({
    meta: [{ title: "IA de Vendas — ZapScout" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: IaVendasPage,
});

const LIMITES = {
  free: { iaAtiva: false, mensagensPorMes: 0 },
  pro: { iaAtiva: true, mensagensPorMes: 500 },
  agencia: { iaAtiva: true, mensagensPorMes: 2000 },
  business: { iaAtiva: true, mensagensPorMes: 9999 },
  dono: { iaAtiva: true, mensagensPorMes: 999999 },
};

function IaVendasPage() {
  const plano = usePlano();
  const limites = LIMITES[plano.id as keyof typeof LIMITES] ?? LIMITES.free;
  const [tab, setTab] = useState("configurar");
  const [conversaAberta, setConversaAberta] = useState<IaConversa | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (!limites.iaAtiva) {
    return <BloqueioFree />;
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto">
      <PageHeader
        title="IA de Vendas"
        subtitle="Seu agente responde leads automaticamente no WhatsApp"
      />

      <EscalonamentosBanner onAbrir={() => setTab("conversas")} />
      <MetricasGrid limites={limites} />

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="configurar">Configurar agente</TabsTrigger>
          <TabsTrigger value="conversas">Ver conversas</TabsTrigger>
          <TabsTrigger value="treinamento">Treinamento</TabsTrigger>
        </TabsList>

        <TabsContent value="configurar">
          <ConfigurarAgente />
        </TabsContent>
        <TabsContent value="conversas">
          {conversaAberta ? (
            <ConversaDetalhe conversa={conversaAberta} onVoltar={() => setConversaAberta(null)} />
          ) : (
            <ListaConversas onAbrir={setConversaAberta} />
          )}
        </TabsContent>
        <TabsContent value="treinamento">
          <Treinamento />
        </TabsContent>
      </Tabs>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        titulo="IA de Vendas — Plano Pro"
        descricao="Faça upgrade para ativar respostas automáticas com IA."
      />
    </div>
  );
}

function BloqueioFree() {
  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-2xl mx-auto">
      <Card className="p-8 text-center">
        <div className="mx-auto mb-4 grid place-items-center h-14 w-14 rounded-2xl bg-primary/15 text-primary">
          <Bot className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-semibold mb-2 inline-flex items-center gap-2 justify-center">
          <Lock className="h-5 w-5" /> IA de Vendas — Plano Pro
        </h2>
        <p className="text-muted-foreground mb-4">
          Deixe a IA responder seus leads 24/7, qualificar prospects e agendar reuniões enquanto
          você faz outras coisas.
        </p>
        <ul className="text-sm text-left max-w-sm mx-auto space-y-2 mb-6">
          <li>✓ Responde em segundos, qualquer horário</li>
          <li>✓ Qualifica leads automaticamente</li>
          <li>✓ Agenda reuniões sem sua intervenção</li>
          <li>✓ Escala para você no momento certo</li>
        </ul>
        <Button asChild>
          <a href="/planos">
            <Sparkles className="h-4 w-4" /> Ver planos — a partir de R$97/mês
          </a>
        </Button>
      </Card>
    </div>
  );
}

function EscalonamentosBanner({ onAbrir }: { onAbrir: () => void }) {
  const listar = useServerFn(listarEscalonamentos);
  const marcar = useServerFn(marcarEscalonamentoLido);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["ia_escalonamentos"],
    queryFn: () => listar(),
    refetchInterval: 30_000,
  });
  if (!data?.length) return null;
  const top = data[0];
  return (
    <Card className="p-4 mb-4 border-warning/40 bg-warning/5 flex items-center gap-3">
      <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">Requer sua atenção ({data.length})</div>
        <div className="text-xs text-muted-foreground truncate">{top.motivo}</div>
      </div>
      <Button
        size="sm"
        onClick={async () => {
          await marcar({ data: { id: top.id } });
          qc.invalidateQueries({ queryKey: ["ia_escalonamentos"] });
          onAbrir();
        }}
      >
        Ver conversa
      </Button>
    </Card>
  );
}

function MetricasGrid({ limites }: { limites: { mensagensPorMes: number } }) {
  const buscarConfig = useServerFn(getIaConfig);
  const listarConv = useServerFn(listarConversasIa);
  const { data: cfg } = useQuery({ queryKey: ["ia_config"], queryFn: () => buscarConfig() });
  const { data: convs } = useQuery({ queryKey: ["ia_conversas"], queryFn: () => listarConv() });
  const ativas = (convs ?? []).filter((c) => c.status === "ativa").length;
  const escaladas = (convs ?? []).filter((c) => c.status === "escalada").length;
  const usadas = cfg?.mensagens_mes_count ?? 0;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Mensagens este mês</div>
        <div className="text-2xl font-semibold">
          {usadas}
          <span className="text-sm font-normal text-muted-foreground">
            /{limites.mensagensPorMes}
          </span>
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Conversas ativas</div>
        <div className="text-2xl font-semibold">{ativas}</div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Aguardam atenção</div>
        <div className="text-2xl font-semibold text-warning">{escaladas}</div>
      </Card>
    </div>
  );
}

function ConfigurarAgente() {
  const buscar = useServerFn(getIaConfig);
  const salvar = useServerFn(salvarIaConfig);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ia_config"], queryFn: () => buscar() });
  const [form, setForm] = useState<IaConfig | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const m = useMutation({
    mutationFn: (d: IaConfig) =>
      salvar({
        data: {
          nome_agente: d.nome_agente,
          cargo: d.cargo,
          nome_agencia: d.nome_agencia,
          tom: d.tom,
          servicos: d.servicos,
          diferenciais: d.diferenciais,
          restricoes: d.restricoes,
          objetivos: d.objetivos,
          mensagens_para_escalar: d.mensagens_para_escalar,
          horario_modo: d.horario_modo,
          horario_inicio: d.horario_inicio,
          horario_fim: d.horario_fim,
          mensagem_boas_vindas: d.mensagem_boas_vindas,
          ativa: d.ativa,
          telefone_alerta: d.telefone_alerta,
        },
      }),
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["ia_config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  const set = (patch: Partial<IaConfig>) => setForm({ ...form, ...patch });

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Identidade do agente</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ativa}
              onChange={(e) => set({ ativa: e.target.checked })}
            />
            <Badge variant={form.ativa ? "default" : "secondary"}>
              {form.ativa ? "● Ativa" : "○ Pausada"}
            </Badge>
          </label>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Nome do agente</Label>
            <Input
              value={form.nome_agente}
              onChange={(e) => set({ nome_agente: e.target.value })}
            />
          </div>
          <div>
            <Label>Cargo / papel</Label>
            <Input value={form.cargo} onChange={(e) => set({ cargo: e.target.value })} />
          </div>
          <div>
            <Label>Nome da agência</Label>
            <Input
              value={form.nome_agencia}
              onChange={(e) => set({ nome_agencia: e.target.value })}
            />
          </div>
          <div>
            <Label>Tom de voz</Label>
            <Select value={form.tom} onValueChange={(v) => set({ tom: v as IaConfig["tom"] })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="amigavel">Amigável</SelectItem>
                <SelectItem value="descontraido">Descontraído</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Contexto do negócio</h3>
        <div className="space-y-3">
          <div>
            <Label>Serviços oferecidos</Label>
            <Textarea
              rows={3}
              value={form.servicos}
              onChange={(e) => set({ servicos: e.target.value })}
            />
          </div>
          <div>
            <Label>Diferenciais</Label>
            <Textarea
              rows={3}
              value={form.diferenciais}
              onChange={(e) => set({ diferenciais: e.target.value })}
            />
          </div>
          <div>
            <Label>O que NÃO fazer (restrições)</Label>
            <Textarea
              rows={3}
              value={form.restricoes}
              onChange={(e) => set({ restricoes: e.target.value })}
            />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Operação</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Escalar após N mensagens sem qualificação</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={form.mensagens_para_escalar}
              onChange={(e) => set({ mensagens_para_escalar: Number(e.target.value) || 3 })}
            />
          </div>
          <div>
            <Label>Horário de operação</Label>
            <Select
              value={form.horario_modo}
              onValueChange={(v) => set({ horario_modo: v as IaConfig["horario_modo"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sempre">Sempre ativa (24/7)</SelectItem>
                <SelectItem value="comercial">Horário comercial (08:00–18:00)</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.horario_modo === "personalizado" && (
            <>
              <div>
                <Label>Início</Label>
                <Input
                  value={form.horario_inicio}
                  onChange={(e) => set({ horario_inicio: e.target.value })}
                  placeholder="08:00"
                />
              </div>
              <div>
                <Label>Fim</Label>
                <Input
                  value={form.horario_fim}
                  onChange={(e) => set({ horario_fim: e.target.value })}
                  placeholder="18:00"
                />
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <Label>Mensagem de boas-vindas</Label>
            <Textarea
              rows={3}
              value={form.mensagem_boas_vindas}
              onChange={(e) => set({ mensagem_boas_vindas: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>WhatsApp para alertas (número seu, com DDD e DDI)</Label>
            <Input
              value={form.telefone_alerta ?? ""}
              onChange={(e) => set({ telefone_alerta: e.target.value || null })}
              placeholder="5553991033670"
            />
            <p className="text-xs text-muted-foreground mt-1">
              A IA te avisa aqui quando um lead perguntar preço ou ficar pronto pra fechar.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => m.mutate(form)} disabled={m.isPending}>
          {m.isPending ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>
    </div>
  );
}

function ListaConversas({ onAbrir }: { onAbrir: (c: IaConversa) => void }) {
  const listar = useServerFn(listarConversasIa);
  const { data } = useQuery({
    queryKey: ["ia_conversas"],
    queryFn: () => listar(),
    refetchInterval: 15_000,
  });
  const convs = data ?? [];
  return (
    <Card className="mt-4 overflow-hidden">
      {convs.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma conversa ainda. Use o simulador em uma conversa para começar.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Lead</th>
              <th className="text-left px-4 py-2">Última mensagem</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {convs.map((c) => {
              const ultima = [...c.mensagens].reverse()[0];
              return (
                <tr
                  key={c.id}
                  className="border-t hover:bg-muted/20 cursor-pointer"
                  onClick={() => onAbrir(c)}
                >
                  <td className="px-4 py-3 font-medium">{c.lead?.nome_empresa ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">
                    {ultima ? `"${ultima.texto.slice(0, 60)}"` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "escalada" ? (
                      <Badge variant="outline" className="text-warning border-warning/40">
                        ⚡ Atenção
                      </Badge>
                    ) : c.status === "encerrada" ? (
                      <Badge variant="secondary">✕ Encerrada</Badge>
                    ) : c.ia_ativa ? (
                      <Badge>🤖 IA</Badge>
                    ) : (
                      <Badge variant="secondary">👤 Você</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost">
                      Abrir
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function ConversaDetalhe({ conversa, onVoltar }: { conversa: IaConversa; onVoltar: () => void }) {
  const listar = useServerFn(listarConversasIa);
  const setAtiva = useServerFn(definirIaAtivaLead);
  const enviarManual = useServerFn(enviarMensagemManual);
  const processar = useServerFn(processarMensagemLead);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["ia_conversas"],
    queryFn: () => listar(),
    refetchInterval: 5_000,
  });
  const atual = useMemo(
    () => data?.find((c) => c.id === conversa.id) ?? conversa,
    [data, conversa],
  );
  const [texto, setTexto] = useState("");
  const [simulado, setSimulado] = useState("");
  const [digitando, setDigitando] = useState(false);

  const mAtiva = useMutation({
    mutationFn: (v: boolean) => setAtiva({ data: { conversa_id: atual.id, ia_ativa: v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ia_conversas"] }),
  });

  const mEnviar = useMutation({
    mutationFn: (t: string) => enviarManual({ data: { conversa_id: atual.id, texto: t } }),
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["ia_conversas"] });
      toast.success("Mensagem registrada");
    },
  });

  const mSimular = useMutation({
    mutationFn: async (t: string) => {
      setDigitando(true);
      try {
        return await processar({ data: { lead_id: atual.lead_id, texto: t } });
      } finally {
        setDigitando(false);
      }
    },
    onSuccess: (r) => {
      setSimulado("");
      qc.invalidateQueries({ queryKey: ["ia_conversas"] });
      qc.invalidateQueries({ queryKey: ["ia_config"] });
      qc.invalidateQueries({ queryKey: ["ia_escalonamentos"] });
      if (r.tipo === "escalada") toast.warning(`IA escalou: ${r.motivo ?? "atenção necessária"}`);
      if (r.tipo === "fora_horario") toast.info("Fora do horário de operação — IA não respondeu");
      if (r.tipo === "ia_inativa") toast.info("IA inativa para esta conversa");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="sm" onClick={onVoltar}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="font-medium">{atual.lead?.nome_empresa ?? "Lead"}</div>
        <Badge variant={atual.ia_ativa ? "default" : "secondary"}>
          {atual.ia_ativa ? "🤖 IA respondendo" : "👤 Você"}
        </Badge>
      </div>

      <div className="border rounded-lg bg-muted/10 p-3 h-96 overflow-y-auto flex flex-col gap-2">
        {atual.mensagens.length === 0 && (
          <div className="text-center text-xs text-muted-foreground mt-10">
            Sem mensagens ainda.
          </div>
        )}
        {atual.mensagens.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
              m.origem === "lead"
                ? "self-start bg-secondary"
                : m.origem === "ia"
                  ? "self-end bg-primary/15 text-foreground"
                  : "self-end bg-success/20 text-foreground"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-0.5">
              {m.origem === "lead" ? "Lead" : m.origem === "ia" ? "🤖 IA" : "Você"}
            </div>
            {m.texto}
          </div>
        ))}
        {digitando && (
          <div className="self-end bg-primary/10 px-3 py-2 rounded-lg text-sm text-muted-foreground inline-flex gap-1">
            <span className="animate-pulse">●</span>
            <span className="animate-pulse [animation-delay:120ms]">●</span>
            <span className="animate-pulse [animation-delay:240ms]">●</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-3">
        {atual.ia_ativa ? (
          <Button variant="outline" onClick={() => mAtiva.mutate(false)}>
            Assumir conversa
          </Button>
        ) : (
          <Button variant="outline" onClick={() => mAtiva.mutate(true)}>
            Devolver para IA
          </Button>
        )}
        <Input
          placeholder="Enviar mensagem manual"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && texto.trim() && mEnviar.mutate(texto.trim())}
        />
        <Button
          onClick={() => texto.trim() && mEnviar.mutate(texto.trim())}
          disabled={mEnviar.isPending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 rounded-lg border border-solid p-3 bg-muted/10">
        <p className="text-xs text-muted-foreground mb-2">
          🧪 Simulador — Digite como se fosse o lead respondendo. A IA responderá usando suas
          configurações.
        </p>
        <div className="flex gap-2">
          <Input
            value={simulado}
            onChange={(e) => setSimulado(e.target.value)}
            placeholder="quanto custa um site?"
            onKeyDown={(e) =>
              e.key === "Enter" && simulado.trim() && mSimular.mutate(simulado.trim())
            }
          />
          <Button
            variant="secondary"
            onClick={() => simulado.trim() && mSimular.mutate(simulado.trim())}
            disabled={mSimular.isPending}
          >
            {mSimular.isPending ? "IA pensando…" : "Enviar como lead"}
          </Button>
        </div>
      </div>
      {/* TODO: substituir simulador pelo webhook real da UazAPI/Evolution em produção */}
    </Card>
  );
}

function Treinamento() {
  const listar = useServerFn(listarIaQAs);
  const upsert = useServerFn(upsertIaQA);
  const del = useServerFn(deletarIaQA);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ia_qas"], queryFn: () => listar() });
  const [dlg, setDlg] = useState<{ id?: string; pergunta: string; resposta: string } | null>(null);

  const m = useMutation({
    mutationFn: (d: { id?: string; pergunta: string; resposta: string }) => upsert({ data: d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ia_qas"] });
      setDlg(null);
      toast.success("Resposta salva");
    },
  });
  const mDel = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ia_qas"] }),
  });

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          A IA usa estas respostas quando detectar perguntas similares.
        </p>
        <Button onClick={() => setDlg({ pergunta: "", resposta: "" })}>
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
      {(data ?? []).map((qa) => (
        <Card key={qa.id} className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Se o lead perguntar sobre:</div>
              <div className="font-medium mb-2">"{qa.pergunta}"</div>
              <div className="text-xs text-muted-foreground">A IA deve responder:</div>
              <div className="text-sm">"{qa.resposta}"</div>
            </div>
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="ghost" onClick={() => setDlg(qa)}>
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => mDel.mutate(qa.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}
      {!data?.length && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Nenhuma resposta treinada ainda.
        </Card>
      )}

      <Dialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dlg?.id ? "Editar resposta" : "Nova resposta treinada"}</DialogTitle>
          </DialogHeader>
          {dlg && (
            <div className="space-y-3">
              <div>
                <Label>Se o lead perguntar sobre:</Label>
                <Input
                  value={dlg.pergunta}
                  onChange={(e) => setDlg({ ...dlg, pergunta: e.target.value })}
                  placeholder="prazo de entrega"
                />
              </div>
              <div>
                <Label>A IA deve responder:</Label>
                <Textarea
                  rows={4}
                  value={dlg.resposta}
                  onChange={(e) => setDlg({ ...dlg, resposta: e.target.value })}
                  placeholder="Nosso prazo padrão é de 7 dias úteis…"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlg(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => dlg && dlg.pergunta.trim() && dlg.resposta.trim() && m.mutate(dlg)}
              disabled={m.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
