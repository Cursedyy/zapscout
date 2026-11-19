import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { toastErro } from "@/lib/traduzir-erro";
import {
  getIaConfig,
  salvarIaConfig,
  salvarNumerosIgnoradosIA,
  listarIaQAs,
  upsertIaQA,
  deletarIaQA,
  listarConversasIa,
  definirIaAtivaLead,
  enviarMensagemManual,
  processarMensagemLead,
  listarEscalonamentos,
  marcarEscalonamentoLido,
  iniciarConversaManual,
  type IaConfig,
  type IaConversa,
} from "@/lib/ia.functions";
import {
  listarAgenteTemplates,
  salvarAgenteTemplate,
  deletarAgenteTemplate,
  listarAgenteTemplatesParaAplicar,
  obterAgenteTemplateParaAplicar,
  type AgenteTemplate,
} from "@/lib/agente-templates.functions";
import { NichoCombobox } from "@/components/nicho-combobox";
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
  ArrowDown,
  FlaskConical,
  LoaderCircle,
  Lock,
  LayoutTemplate,
  Pencil,
} from "lucide-react";
import { usePlano } from "@/store/app-store";
import { UpgradeModal } from "@/components/upgrade-modal";
import { IaAnexosPanel } from "@/components/ia-anexos-panel";
import { numerosIgnoradosInput } from "@/lib/ia-numeros-ignorados";
import { formatarNumeroExibicaoBR } from "@/lib/telefone";

export const Route = createFileRoute("/app/ia-vendas")({
  head: () => ({
    meta: [{ title: "IA de Vendas — ZapScout" }, { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Configure o atendimento e a pré-qualificação de leads pelo WhatsApp no ZapScout." },
      { property: "og:title", content: "IA de Vendas — ZapScout" },
      { property: "og:description", content: "Gerencie seu agente de vendas e as conversas do WhatsApp." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }],
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
          <TabsTrigger value="anexos">Imagens e catálogo</TabsTrigger>
          {plano.id === "dono" && <TabsTrigger value="modelos">Modelos de agente</TabsTrigger>}
        </TabsList>

        <TabsContent value="configurar">
          <ConfigurarAgente />
        </TabsContent>
        <TabsContent value="conversas">
          {conversaAberta ? (
            <ConversaDetalhe
              key={conversaAberta.id}
              conversa={conversaAberta}
              onVoltar={() => setConversaAberta(null)}
            />
          ) : (
            <ListaConversas onAbrir={setConversaAberta} />
          )}
        </TabsContent>
        <TabsContent value="treinamento">
          <Treinamento />
        </TabsContent>
        <TabsContent value="anexos"><IaAnexosPanel /></TabsContent>
        {plano.id === "dono" && (
          <TabsContent value="modelos">
            <ModelosDeAgente />
          </TabsContent>
        )}
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
  const salvarNumeros = useServerFn(salvarNumerosIgnoradosIA);
  const salvar = useServerFn(salvarIaConfig);
  const listarTemplates = useServerFn(listarAgenteTemplatesParaAplicar);
  const obterTemplate = useServerFn(obterAgenteTemplateParaAplicar);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ia_config"], queryFn: () => buscar() });
  const { data: templates } = useQuery({
    queryKey: ["agente_templates_aplicar"],
    queryFn: () => listarTemplates(),
  });
  const [form, setForm] = useState<IaConfig | null>(null);
  const [templateSelecionado, setTemplateSelecionado] = useState("");
  const [numeroExcluir, setNumeroExcluir] = useState("");
  const [erroNumero, setErroNumero] = useState("");
  const exclusoes = useMutation({
    mutationFn: (numeros: string[]) => salvarNumeros({ data: numeros }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ia_config"] }); toast.success("Lista salva"); },
    onError: (e: Error) => toastErro(e, "Falha ao salvar a lista"),
  });

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const aplicarTemplate = useMutation({
    mutationFn: (id: string) => obterTemplate({ data: { id } }),
    onSuccess: (tpl) => {
      setForm((prev) => (prev ? { ...prev, ...tpl } : prev));
      toast.success("Modelo aplicado — revise os campos e salve.");
    },
    onError: (e: Error) => toastErro(e, "Falha ao salvar"),
  });

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
          numeros_ignorados: d.numeros_ignorados ?? [],
          destinos_escalonamento: (d.destinos_escalonamento ?? []).filter(
            (x) => x.nome.trim() && x.assunto.trim() && x.telefone.trim(),
          ),
        },
      }),
    onSuccess: (updated) => {
      setForm(updated);
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["ia_config"] });
    },
    onError: (e: Error) => toastErro(e, "Falha ao salvar"),
  });

  if (!form) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  const set = (patch: Partial<IaConfig>) => setForm({ ...form, ...patch });

  return (
    <div className="space-y-4 mt-4">
      {!!templates?.length && (
        <Card className="p-4">
          <Label className="mb-2 block">Aplicar modelo</Label>
          <div className="flex gap-2">
            <Select
              value={templateSelecionado}
              onValueChange={(v) => {
                setTemplateSelecionado(v);
                aplicarTemplate.mutate(v);
              }}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione um modelo salvo (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome} {t.nicho ? `— ${t.nicho}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Preenche os campos abaixo com o modelo escolhido. Você ainda pode editar tudo antes de
            salvar.
          </p>
        </Card>
      )}

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
              placeholder="5511999999999"
            />
            <p className="text-xs text-muted-foreground mt-1">
              A IA te avisa aqui quando um lead perguntar preço ou ficar pronto pra fechar. Usado quando nenhum responsável abaixo se encaixar.
            </p>
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>Para quem passar a conversa</Label>
            <p className="text-xs text-muted-foreground">
              Ex.: assunto "vendas e pedidos" vai para você; "representante comercial" vai para o Eduardo.
            </p>
            {(form.destinos_escalonamento ?? []).map((d, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr_auto] gap-2">
                <Input aria-label="Nome do responsável" placeholder="Nome" value={d.nome}
                  onChange={(e) => set({ destinos_escalonamento: form.destinos_escalonamento.map((x, j) => j === i ? { ...x, nome: e.target.value } : x) })} />
                <Input aria-label="Assunto" placeholder="Assunto (ex.: representante comercial)" value={d.assunto}
                  onChange={(e) => set({ destinos_escalonamento: form.destinos_escalonamento.map((x, j) => j === i ? { ...x, assunto: e.target.value } : x) })} />
                <Input aria-label="WhatsApp do responsável" type="tel" placeholder="5551999999999" value={d.telefone}
                  onChange={(e) => set({ destinos_escalonamento: form.destinos_escalonamento.map((x, j) => j === i ? { ...x, telefone: e.target.value } : x) })} />
                <Button variant="ghost" size="icon" aria-label="Remover responsável"
                  onClick={() => set({ destinos_escalonamento: form.destinos_escalonamento.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm"
              onClick={() => set({ destinos_escalonamento: [...(form.destinos_escalonamento ?? []), { nome: "", assunto: "", telefone: "" }] })}>
              <Plus className="size-4" />Adicionar responsável
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Números que a IA não deve responder</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input aria-label="Número excluído da IA" type="tel" value={numeroExcluir}
            placeholder="+55 (11) 99999-8888"
            onChange={(e) => { setNumeroExcluir(e.target.value); setErroNumero(""); }} />
          <Button variant="outline" onClick={() => {
            const parsed = numerosIgnoradosInput.safeParse([numeroExcluir]);
            if (!parsed.success) { setErroNumero("Informe um número válido com DDD."); return; }
            set({ numeros_ignorados: [...new Set([...(form.numeros_ignorados ?? []), ...parsed.data])] });
            setNumeroExcluir(""); setErroNumero("");
          }}><Plus className="size-4" />Adicionar</Button>
        </div>
        {erroNumero && <p role="alert" className="text-sm text-destructive mt-2">{erroNumero}</p>}
        <ul className="mt-3 divide-y divide-border">
          {(form.numeros_ignorados ?? []).map((numero) => <li key={numero} className="flex items-center justify-between gap-2 py-2">
            <span className="text-sm break-all">{formatarNumeroExibicaoBR(numero)}</span>
            <Button variant="ghost" size="icon" title="Remover número" aria-label={`Remover ${numero}`}
              onClick={() => set({ numeros_ignorados: form.numeros_ignorados.filter((n) => n !== numero) })}>
              <Trash2 className="size-4" />
            </Button>
          </li>)}
        </ul>
        <div className="flex justify-end mt-3">
          <Button variant="outline" disabled={exclusoes.isPending}
            onClick={() => exclusoes.mutate(form.numeros_ignorados ?? [])}>
            {exclusoes.isPending ? "Salvando lista…" : "Salvar lista"}
          </Button>
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
  const iniciar = useServerFn(iniciarConversaManual);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["ia_conversas"],
    queryFn: () => listar(),
    refetchInterval: 15_000,
  });
  const convs = data ?? [];

  const [novaOpen, setNovaOpen] = useState(false);
  const [novaNome, setNovaNome] = useState("");
  const [novaTel, setNovaTel] = useState("");
  const [novaMsg, setNovaMsg] = useState("");
  const [novaUsarBoas, setNovaUsarBoas] = useState(true);

  const mNova = useMutation({
    mutationFn: () =>
      iniciar({
        data: {
          nome: novaNome.trim(),
          telefone: novaTel.trim(),
          primeira_mensagem: novaMsg.trim() || undefined,
          enviar_boas_vindas: novaUsarBoas,
        },
      }),
    onSuccess: async (r) => {
      toast.success("Conversa criada — IA ativa para este lead");
      if (r.aviso) toast.warning(r.aviso);
      setNovaOpen(false);
      setNovaNome("");
      setNovaTel("");
      setNovaMsg("");
      await qc.invalidateQueries({ queryKey: ["ia_conversas"] });
      const listaAtualizada = await listar();
      const nova = listaAtualizada.find((c) => c.id === r.conversa_id);
      if (nova) onAbrir(nova);
    },
    onError: (e: Error) => toastErro(e, "Falha ao salvar"),
  });

  return (
    <>
      <div className="flex items-center justify-between mt-4 mb-2">
        <p className="text-sm text-muted-foreground">Conversas ativas com a IA de vendas.</p>
        <Button onClick={() => setNovaOpen(true)}>
          <Plus className="h-4 w-4" /> Nova conversa
        </Button>
      </div>
      <Card className="overflow-hidden">
        {convs.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma conversa ainda. Clique em <b>Nova conversa</b> para adicionar um lead
            manualmente.
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

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conversa com IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome do lead / empresa</Label>
              <Input
                value={novaNome}
                onChange={(e) => setNovaNome(e.target.value)}
                placeholder="Padaria do João"
              />
            </div>
            <div>
              <Label>WhatsApp (com DDD)</Label>
              <Input
                value={novaTel}
                onChange={(e) => setNovaTel(e.target.value)}
                placeholder="11999999999"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Precisa ser celular com 9º dígito. Ex: 5399XXXXYYYY ou 55 5399XXXXYYYY.
              </p>
            </div>
            <div>
              <Label>Primeira mensagem (opcional)</Label>
              <Textarea
                rows={3}
                value={novaMsg}
                onChange={(e) => setNovaMsg(e.target.value)}
                placeholder="Deixe em branco para usar a mensagem de boas-vindas configurada."
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={novaUsarBoas}
                onChange={(e) => setNovaUsarBoas(e.target.checked)}
              />
              Se vazio, enviar a mensagem de boas-vindas do agente
            </label>
            <p className="text-xs text-muted-foreground">
              A IA fica ativa automaticamente e responderá as próximas mensagens do lead no
              WhatsApp.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNovaOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => mNova.mutate()}
              disabled={mNova.isPending || !novaNome.trim() || !novaTel.trim()}
            >
              {mNova.isPending ? "Criando…" : "Criar e ativar IA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const dataMensagem = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" });
const horaMensagem = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" });

function dataValidaMensagem(ts: number) {
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const data = new Date(ts);
  return Number.isFinite(data.getTime()) ? data : null;
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
  const atual = data?.find((c) => c.id === conversa.id) ?? conversa;
  const telefone = formatarNumeroExibicaoBR(atual.lead?.whatsapp || atual.lead?.telefone);
  const [texto, setTexto] = useState("");
  const [simulado, setSimulado] = useState("");
  const [digitando, setDigitando] = useState(false);
  const [longeDoFim, setLongeDoFim] = useState(false);
  const historico = useRef<HTMLDivElement>(null);
  const campoMensagem = useRef<HTMLTextAreaElement>(null);
  const acompanhandoFim = useRef(true);
  const enviando = useRef(false);
  const compondo = useRef(false);
  const ultimaMensagem = atual.mensagens.at(-1);

  useLayoutEffect(() => {
    const painel = historico.current;
    if (painel && acompanhandoFim.current) painel.scrollTop = painel.scrollHeight;
  }, [atual.mensagens.length, ultimaMensagem]);

  const mAtiva = useMutation({
    mutationFn: (v: boolean) => setAtiva({ data: { conversa_id: atual.id, ia_ativa: v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ia_conversas"] }),
    onError: () => toast.error("Não foi possível mudar o modo de atendimento."),
  });

  const mEnviar = useMutation({
    mutationFn: (t: string) => enviarManual({ data: { conversa_id: atual.id, texto: t } }),
    retry: false,
    onSuccess: async () => {
      setTexto("");
      await qc.invalidateQueries({ queryKey: ["ia_conversas"] });
    },
    onSettled: () => {
      enviando.current = false;
    },
  });

  function enviarMensagem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mensagem = texto.trim();
    if (!mensagem || compondo.current || enviando.current || mEnviar.isPending) return;
    enviando.current = true;
    campoMensagem.current?.focus({ preventScroll: true });
    mEnviar.mutate(mensagem);
  }

  function irParaFim() {
    acompanhandoFim.current = true;
    setLongeDoFim(false);
    const painel = historico.current;
    if (painel) {
      painel.focus({ preventScroll: true });
      painel.scrollTop = painel.scrollHeight;
    }
  }

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
      if (r.tipo === "bot_detectado")
        toast.info(`Padrão de autoresponder detectado — IA não respondeu (${r.motivo})`);
      if (r.tipo === "sem_resposta")
        toast.info("IA decidiu não responder a esta mensagem (resposta vazia)");
    },
    onError: (e: Error) => toastErro(e, "Falha ao salvar"),
  });


  return (
    <div className="mt-4 min-w-0 space-y-4">
      <section aria-label="Conversa do WhatsApp" className="flex h-[clamp(26rem,72dvh,52rem)] min-w-0 flex-col overflow-hidden rounded-sm border bg-card">
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-3 sm:px-4">
          <Button type="button" variant="ghost" size="icon" onClick={onVoltar} aria-label="Voltar às conversas" title="Voltar às conversas" className="shrink-0">
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-success/15 text-success" aria-hidden="true">
            <MessageCircle className="size-5" />
          </div>
          <div className="min-w-0 flex-1 basis-36">
            <h2 className="truncate text-sm font-semibold tracking-normal" title={atual.lead?.nome_empresa}>
              {atual.lead?.nome_empresa || "Lead"}
            </h2>
            {telefone && <p className="text-xs text-muted-foreground">{telefone}</p>}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span role="status" className={atual.ia_ativa ? "text-xs font-medium text-success" : "text-xs font-medium text-foreground"}>
              {atual.ia_ativa ? "IA respondendo" : "Atendimento manual"}
            </span>
            <Button type="button" variant="outline" size="sm" disabled={mAtiva.isPending} onClick={() => mAtiva.mutate(!atual.ia_ativa)}>
              {atual.ia_ativa ? "Assumir conversa" : "Devolver para IA"}
            </Button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 bg-secondary/45">
          <div
            ref={historico}
            role="log"
            aria-label="Histórico de mensagens"
            tabIndex={0}
            className="flex h-full flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
            onScroll={(event) => {
              const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
              acompanhandoFim.current = scrollHeight - scrollTop - clientHeight <= 48;
              setLongeDoFim(!acompanhandoFim.current);
            }}
          >
            {!atual.mensagens.length && (
              <p className="m-auto text-center text-sm text-muted-foreground">Sem mensagens ainda.</p>
            )}
            {atual.mensagens.map((mensagem, i) => {
              const data = dataValidaMensagem(mensagem.ts);
              const dia = data && dataMensagem.format(data);
              const anterior = i > 0 ? dataValidaMensagem(atual.mensagens[i - 1].ts) : null;
              const deLead = mensagem.origem === "lead";
              return (
                <div key={`${mensagem.ts}-${mensagem.origem}-${i}`} className="flex flex-col gap-2">
                  {dia && (!anterior || dia !== dataMensagem.format(anterior)) && (
                    <div className="self-center rounded-sm bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">{dia}</div>
                  )}
                  <div className={`min-w-0 max-w-[88%] rounded-sm border px-3 py-2 text-sm leading-relaxed text-foreground sm:max-w-[75%] ${
                    deLead ? "self-start rounded-tl-none bg-card" : "self-end rounded-tr-none border-success/20 bg-success/15"
                  }`}>
                    <div className="mb-0.5 text-xs font-medium text-muted-foreground">
                      {deLead ? "Lead" : mensagem.origem === "ia" ? "IA" : "Você"}
                    </div>
                    <p className="whitespace-pre-wrap wrap-anywhere">{mensagem.texto}</p>
                    {data && (
                      <time dateTime={data.toISOString()} title={`${dia}, ${horaMensagem.format(data)}`} className="block text-right text-xs tabular-nums text-muted-foreground">
                        {horaMensagem.format(data)}
                      </time>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {longeDoFim && (
            <Button type="button" variant="outline" size="icon" className="absolute right-4 bottom-3 rounded-full" onClick={irParaFim} aria-label="Ir para as últimas mensagens" title="Ir para as últimas mensagens">
              <ArrowDown aria-hidden="true" />
            </Button>
          )}
        </div>

        <form onSubmit={enviarMensagem} className="shrink-0 space-y-2 border-t bg-card px-3 py-3 sm:px-4">
          {mEnviar.isError && (
            <p id="erro-mensagem-manual" role="alert" className="text-sm text-destructive">
              Não foi possível confirmar o envio pelo WhatsApp. Sua mensagem foi mantida.
            </p>
          )}
          <div className="flex min-w-0 items-end gap-2">
            <Textarea
              ref={campoMensagem}
              aria-label="Mensagem manual"
              aria-describedby={mEnviar.isError ? "erro-mensagem-manual" : undefined}
              placeholder="Digite uma mensagem"
              rows={2}
              maxLength={4000}
              readOnly={mEnviar.isPending}
              className="min-h-12 min-w-0 flex-1 resize-none rounded-sm bg-background"
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              onCompositionStart={() => { compondo.current = true; }}
              onCompositionEnd={() => { compondo.current = false; }}
              onKeyDown={(event) => {
                const { nativeEvent } = event;
                if (event.key !== "Enter" || event.defaultPrevented || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || compondo.current || nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
                event.preventDefault();
                if (!event.repeat) event.currentTarget.form?.requestSubmit();
              }}
            />
            <Button type="submit" size="icon" className="size-12 shrink-0 rounded-full" disabled={!texto.trim() || mEnviar.isPending} aria-label={mEnviar.isPending ? "Enviando mensagem" : "Enviar mensagem"} title="Enviar mensagem">
              {mEnviar.isPending ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            </Button>
          </div>
          <span role="status" className="sr-only">{mEnviar.isPending ? "Enviando mensagem…" : mEnviar.isSuccess ? "Mensagem enviada." : ""}</span>
        </form>
      </section>

      <details className="rounded-sm border bg-muted/40 px-3 py-3 sm:px-4">
        <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <FlaskConical className="mx-1 inline size-4 text-muted-foreground" aria-hidden="true" /> Simulador da IA
          {digitando && <span role="status" className="ml-2 text-xs text-muted-foreground">IA pensando…</span>}
        </summary>
        <p className="mt-3 mb-2 text-xs text-muted-foreground">
          Simule uma mensagem do lead. A simulação pode aparecer no histórico desta conversa.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Mensagem simulada do lead"
            className="min-w-0 flex-1 basis-48"
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
      </details>
    </div>
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

type TemplateForm = {
  id?: string;
  nome: string;
  nicho: string;
  nome_agente: string;
  cargo: string;
  nome_agencia: string;
  tom: IaConfig["tom"];
  servicos: string;
  diferenciais: string;
  restricoes: string;
  objetivos: string[];
  mensagens_para_escalar: number;
  horario_modo: IaConfig["horario_modo"];
  horario_inicio: string;
  horario_fim: string;
  mensagem_boas_vindas: string;
};

const TEMPLATE_VAZIO: TemplateForm = {
  nome: "",
  nicho: "",
  nome_agente: "",
  cargo: "",
  nome_agencia: "",
  tom: "amigavel",
  servicos: "",
  diferenciais: "",
  restricoes: "",
  objetivos: [],
  mensagens_para_escalar: 3,
  horario_modo: "sempre",
  horario_inicio: "08:00",
  horario_fim: "18:00",
  mensagem_boas_vindas: "",
};

function ModelosDeAgente() {
  const listar = useServerFn(listarAgenteTemplates);
  const salvar = useServerFn(salvarAgenteTemplate);
  const del = useServerFn(deletarAgenteTemplate);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["agente_templates"],
    queryFn: () => listar(),
  });
  const [dlg, setDlg] = useState<TemplateForm | null>(null);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["agente_templates"] });
    qc.invalidateQueries({ queryKey: ["agente_templates_aplicar"] });
  };

  const m = useMutation({
    mutationFn: (d: TemplateForm) => salvar({ data: d }),
    onSuccess: () => {
      invalidar();
      setDlg(null);
      toast.success("Modelo salvo");
    },
    onError: (e: Error) => toastErro(e, "Falha ao salvar"),
  });
  const mDel = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      invalidar();
      toast.success("Modelo removido");
    },
    onError: (e: Error) => toastErro(e, "Falha ao salvar"),
  });

  const abrirEdicao = (tpl: AgenteTemplate) =>
    setDlg({
      id: tpl.id,
      nome: tpl.nome,
      nicho: tpl.nicho,
      nome_agente: tpl.nome_agente,
      cargo: tpl.cargo,
      nome_agencia: tpl.nome_agencia,
      tom: tpl.tom,
      servicos: tpl.servicos,
      diferenciais: tpl.diferenciais,
      restricoes: tpl.restricoes,
      objetivos: tpl.objetivos,
      mensagens_para_escalar: tpl.mensagens_para_escalar,
      horario_modo: tpl.horario_modo,
      horario_inicio: tpl.horario_inicio,
      horario_fim: tpl.horario_fim,
      mensagem_boas_vindas: tpl.mensagem_boas_vindas,
    });

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Modelos reutilizáveis pra aplicar rápido na config de um agente novo.
        </p>
        <Button onClick={() => setDlg({ ...TEMPLATE_VAZIO })}>
          <Plus className="h-4 w-4" /> Novo modelo
        </Button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}

      {(data ?? []).map((tpl) => (
        <Card key={tpl.id} className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
              <LayoutTemplate className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{tpl.nome}</div>
              {tpl.nicho && (
                <Badge variant="secondary" className="mt-1">
                  {tpl.nicho}
                </Badge>
              )}
              <div className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {tpl.servicos || "Sem descrição de serviços"}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="ghost" onClick={() => abrirEdicao(tpl)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => mDel.mutate(tpl.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}

      {!isLoading && !data?.length && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <LayoutTemplate className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Nenhum modelo salvo ainda.
        </Card>
      )}

      <Dialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlg?.id ? "Editar modelo" : "Novo modelo de agente"}</DialogTitle>
          </DialogHeader>
          {dlg && (
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Nome do modelo</Label>
                  <Input
                    value={dlg.nome}
                    onChange={(e) => setDlg({ ...dlg, nome: e.target.value })}
                    placeholder="Restaurante"
                  />
                </div>
                <div>
                  <Label>Nicho</Label>
                  <NichoCombobox value={dlg.nicho} onChange={(v) => setDlg({ ...dlg, nicho: v })} />
                </div>
                <div>
                  <Label>Nome do agente</Label>
                  <Input
                    value={dlg.nome_agente}
                    onChange={(e) => setDlg({ ...dlg, nome_agente: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Cargo / papel</Label>
                  <Input
                    value={dlg.cargo}
                    onChange={(e) => setDlg({ ...dlg, cargo: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Nome da agência</Label>
                  <Input
                    value={dlg.nome_agencia}
                    onChange={(e) => setDlg({ ...dlg, nome_agencia: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Tom de voz</Label>
                  <Select
                    value={dlg.tom}
                    onValueChange={(v) => setDlg({ ...dlg, tom: v as IaConfig["tom"] })}
                  >
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

              <div>
                <Label>Serviços oferecidos</Label>
                <Textarea
                  rows={3}
                  value={dlg.servicos}
                  onChange={(e) => setDlg({ ...dlg, servicos: e.target.value })}
                />
              </div>
              <div>
                <Label>Diferenciais</Label>
                <Textarea
                  rows={3}
                  value={dlg.diferenciais}
                  onChange={(e) => setDlg({ ...dlg, diferenciais: e.target.value })}
                />
              </div>
              <div>
                <Label>O que NÃO fazer (restrições)</Label>
                <Textarea
                  rows={3}
                  value={dlg.restricoes}
                  onChange={(e) => setDlg({ ...dlg, restricoes: e.target.value })}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Escalar após N mensagens sem qualificação</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={dlg.mensagens_para_escalar}
                    onChange={(e) =>
                      setDlg({ ...dlg, mensagens_para_escalar: Number(e.target.value) || 3 })
                    }
                  />
                </div>
                <div>
                  <Label>Horário de operação</Label>
                  <Select
                    value={dlg.horario_modo}
                    onValueChange={(v) =>
                      setDlg({ ...dlg, horario_modo: v as IaConfig["horario_modo"] })
                    }
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
                {dlg.horario_modo === "personalizado" && (
                  <>
                    <div>
                      <Label>Início</Label>
                      <Input
                        value={dlg.horario_inicio}
                        onChange={(e) => setDlg({ ...dlg, horario_inicio: e.target.value })}
                        placeholder="08:00"
                      />
                    </div>
                    <div>
                      <Label>Fim</Label>
                      <Input
                        value={dlg.horario_fim}
                        onChange={(e) => setDlg({ ...dlg, horario_fim: e.target.value })}
                        placeholder="18:00"
                      />
                    </div>
                  </>
                )}
                <div className="md:col-span-2">
                  <Label>Mensagem de boas-vindas</Label>
                  <Textarea
                    rows={3}
                    value={dlg.mensagem_boas_vindas}
                    onChange={(e) => setDlg({ ...dlg, mensagem_boas_vindas: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlg(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => dlg && dlg.nome.trim() && dlg.nicho.trim() && m.mutate(dlg)}
              disabled={m.isPending}
            >
              Salvar modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
