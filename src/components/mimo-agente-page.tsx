import { PoliticaComercialAgente } from "./mimo-agente-politica";
import {
  MateriaisAgente,
  RespostaManualAgente,
  type MaterialPainelAgente,
} from "./mimo-agente-operacao";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, PauseCircle, Send, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  configAgenteSchema,
  configInicialAgente,
  camposAgente,
  type ConfigAgente,
  type DadosAgente,
  type MensagemAgente,
} from "@/lib/mimo-agente";
import {
  acaoAgenteSchema,
  alterarAgenteMimo,
  painelAgenteMimo,
  simularAgenteMimo,
} from "@/lib/mimo-agente.functions";
type Conversa = {
  id: string;
  lead_id: string | null;
  telefone: string;
  nome_empresa: string | null;
  responsavel_id: string | null;
  estado: string;
  motivo: string;
  resumo: string;
  dados: DadosAgente;
  piloto: boolean;
  revisao_humana: string;
  mensagens?: {
    direcao: string;
    texto: string;
    contato_em: string;
    referencia_anuncio?: { id: string; url: string } | null;
  }[];
  fila: {
    id: string;
    estado: string;
    motivo: string;
    geracoes: number;
    latencia_ms: number | null;
  }[];
};
type Painel = {
  indicadores?: {
    filaHumana: number;
    incompletas: number;
    confirmadas: number;
    rejeitadas: number;
    pedidosHumano: number;
  };
  consumo?: {
    geracoes: number;
    geracoesPiloto: number;
    falhas: number;
    incertas: number;
    primeiraRespostaMs: number | null;
  };
  gestor: boolean;
  materiais: MaterialPainelAgente[];
  config: {
    revisao: number;
    rascunho: unknown;
    modo: string;
    publicada: number | null;
    testada: number | null;
  } | null;
  conversas: Conversa[];
  versoes: { versao: number; ator_id: string; created_at: string; config: ConfigAgente }[];
  historico: { id: string; acao: string; created_at: string; ator_id: string | null }[];
};
const rotulos: Record<(typeof camposAgente)[number], string> = {
  nome: "Nome do contato",
  empresa: "Empresa",
  estabelecimento: "Como vende ou pretende revender",
  cidade_uf: "Cidade e UF",
  revenda: "Interesse nos produtos / revenda",
  compras: "Relação com as compras",
};
const caixa = "rounded-xl border bg-card p-5 space-y-4";
export function MimoAgentePage() {
  const q = useQuery({
    queryKey: ["mimo-agente"],
    queryFn: () => painelAgenteMimo(),
    refetchInterval: 10000,
  });
  if (q.isPending)
    return (
      <p className="p-6" role="status">
        Carregando agente…
      </p>
    );
  if (q.error)
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Agente de atendimento</h1>
        <p role="alert">{q.error.message}</p>
        <Button onClick={() => q.refetch()}>Tentar novamente</Button>
      </div>
    );
  return <EditorAgente painel={q.data!.painel as unknown as Painel} vinculos={q.data!.vinculos} />;
}
function EditorAgente({
  painel: p,
  vinculos,
}: {
  painel: Painel;
  vinculos: { id: string; numero_comercial: string; ativo: boolean }[];
}) {
  const qc = useQueryClient();
  const [rascunho, setRascunho] = useState<ConfigAgente | null>(null),
    [vinculo, setVinculo] = useState("");
  const [rascunhoRevisao, setRascunhoRevisao] = useState<number | null>(null);
  const [sim, setSim] = useState<MensagemAgente[]>([]),
    [dados, setDados] = useState<DadosAgente>({}),
    [entrada, setEntrada] = useState("");
  const [resumo, setResumo] = useState("");
  const cfg = rascunho ?? configAgenteSchema.parse(p.config?.rascunho ?? configInicialAgente);
  const editar = <K extends keyof ConfigAgente>(k: K, v: ConfigAgente[K]) => {
    if (!rascunho) setRascunhoRevisao(p.config?.revisao ?? 1);
    setRascunho({ ...cfg, [k]: v });
  };
  const atualizar = () => qc.invalidateQueries({ queryKey: ["mimo-agente"] });
  const salvar = useMutation({
    mutationFn: (data: { data: z.infer<typeof acaoAgenteSchema> }) => alterarAgenteMimo(data),
    onSuccess: (_r, variables) => {
      if (variables.data?.acao === "salvar") {
        setRascunho(null);
        setRascunhoRevisao(null);
      }
      atualizar();
      toast.success("Alteração registrada.");
    },
    onError: (e) => toast.error(e.message),
  });
  const agir = (
    acao:
      | "salvar"
      | "publicar"
      | "pausar_geral"
      | "ativar"
      | "assumir"
      | "pausar"
      | "devolver"
      | "revisar",
    extra: Record<string, unknown> = {},
  ) =>
    salvar.mutate({
      data: {
        acao,
        revisao: acao === "salvar" ? (rascunhoRevisao ?? p.config?.revisao) : p.config?.revisao,
        publicada: p.config?.publicada ?? undefined,
        ...extra,
      } as z.infer<typeof acaoAgenteSchema>,
    });
  const simulador = useMutation({
    mutationFn: simularAgenteMimo,
    onSuccess: (r) => {
      setSim((s) => [...s, { role: "assistant", content: r.resposta }]);
      setDados(r.dados);
      setResumo(r.resumo + " · " + r.estado + " · " + r.motivo);
      atualizar();
    },
    onError: (e) => toast.error(e.message),
  });
  useEffect(() => {
    setSim([]);
    setDados({});
    setResumo("");
  }, [p.config?.revisao]);
  const enviarSim = () => {
    if (!entrada.trim() || !p.config) return;
    const mensagens = [...sim, { role: "user" as const, content: entrada.trim() }];
    setSim(mensagens);
    setEntrada("");
    simulador.mutate({ data: { revisao: p.config.revisao, mensagens, dados } });
  };
  const texto = (
    k:
      | "nome"
      | "apresentacao"
      | "tom"
      | "vocabulario"
      | "exemplos"
      | "conhecimento"
      | "restricoes"
      | "disponibilidade",
    label: string,
    grande = false,
  ) => (
    <label className="grid gap-2 text-sm">
      {label}
      {grande ? (
        <Textarea
          value={cfg[k]}
          onChange={(e) => editar(k, e.target.value)}
          rows={k === "conhecimento" ? 10 : 4}
        />
      ) : (
        <Input value={cfg[k]} onChange={(e) => editar(k, e.target.value)} />
      )}
    </label>
  );
  const numero = (
    k:
      | "tamanho"
      | "silencioSegundos"
      | "agrupamentoSegundos"
      | "digitandoMinMs"
      | "digitandoMaxMs"
      | "maxMensagens"
      | "limiteDiario",
    label: string,
  ) => (
    <label className="grid gap-2 text-sm">
      {label}
      <Input type="number" value={cfg[k]} onChange={(e) => editar(k, Number(e.target.value))} />
    </label>
  );
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="text-primary" />
            <h1 className="text-2xl font-semibold">Agente de atendimento</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Revenda, consumo e suporte · revisão humana · atendimento automático 24h
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-sm">
          {p.config?.modo ?? "Operação"} · versão {p.config?.publicada ?? "não publicada"}
        </span>
      </header>
      {p.gestor && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={salvar.isPending}
            onClick={() => {
              const r = configAgenteSchema.safeParse(cfg);
              if (!r.success) {
                toast.error(r.error.issues[0].message);
                return;
              }
              agir("salvar", { config: r.data });
              setSim([]);
              setDados({});
            }}
          >
            Salvar rascunho
          </Button>
          <Button
            variant="outline"
            disabled={!!rascunho || salvar.isPending || p.config?.testada !== p.config?.revisao}
            onClick={() => agir("publicar")}
          >
            Publicar versão
          </Button>
          <Button
            variant="destructive"
            disabled={salvar.isPending}
            onClick={() => agir("pausar_geral")}
          >
            <PauseCircle />
            Pausa geral
          </Button>
        </div>
      )}
      <Tabs defaultValue={p.gestor ? "personalidade" : "operacao"}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {p.gestor && (
            <>
              <TabsTrigger value="personalidade">Personalidade</TabsTrigger>
              <TabsTrigger value="conhecimento">Conhecimento</TabsTrigger>
              <TabsTrigger value="comportamento">Comportamento</TabsTrigger>
            </>
          )}
          <TabsTrigger value="operacao">Operação</TabsTrigger>
          {p.gestor && (
            <TabsTrigger value="simulador">
              <FlaskConical className="mr-1 h-4 w-4" />
              Simulador e publicação
            </TabsTrigger>
          )}
        </TabsList>
        {p.gestor && (
          <>
            <TabsContent value="personalidade">
              <section className={caixa}>
                {texto("nome", "Nome do assistente")}
                {texto("apresentacao", "Apresentação transparente", true)}
                {texto("tom", "Tom de voz")}
                <label className="grid gap-2 text-sm">
                  Formalidade
                  <select
                    className="rounded border bg-background p-2"
                    value={cfg.formalidade}
                    onChange={(e) =>
                      editar("formalidade", e.target.value as ConfigAgente["formalidade"])
                    }
                  >
                    <option value="informal">Informal</option>
                    <option value="equilibrada">Equilibrada</option>
                    <option value="formal">Formal</option>
                  </select>
                </label>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={cfg.emojis}
                    onChange={(e) => editar("emojis", e.target.checked)}
                  />
                  Permitir emojis
                </label>
                {numero("tamanho", "Limite de caracteres por resposta (80–800)")}
                {texto("vocabulario", "Vocabulário preferido e termos a evitar", true)}
                {texto("exemplos", "Exemplos de conversas desejadas", true)}
              </section>
            </TabsContent>
            <TabsContent value="conhecimento">
              <section className={caixa}>
                <p className="text-sm text-muted-foreground">
                  Preencha com informações aprovadas pela equipe: apresentação da MiMo, produtos,
                  FAQ e respostas autorizadas. Dúvidas sem resposta aprovada seguem para a equipe.
                </p>
                {texto("conhecimento", "Conhecimento aprovado", true)}
                {texto("restricoes", "Restrições e limites", true)}
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={cfg.conhecimentoRevisado}
                    onChange={(e) => editar("conhecimentoRevisado", e.target.checked)}
                  />
                  A equipe revisou este conhecimento
                </label>
                <PoliticaComercialAgente
                  value={cfg.politicaComercial}
                  onChange={(v) => editar("politicaComercial", v)}
                />
                <MateriaisAgente
                  materiais={p.materiais ?? []}
                  selecionados={cfg.materiais}
                  selecionar={(ids) => editar("materiais", ids)}
                />
                <p className="text-sm text-muted-foreground">
                  Áudios e uploads não são interpretados. Materiais devem ser aprovados e mantidos
                  privados.
                </p>
              </section>
            </TabsContent>
            <TabsContent value="comportamento">
              <section className={caixa}>
                <p className="text-sm">
                  Entrada: somente novos contatos após a ativação. Contatos antigos e atendimento
                  humano exigem ação explícita. Sem retomadas automáticas e sem exigir CNPJ.
                </p>
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">Campos para pré-qualificação</legend>
                  {camposAgente.map((k) => (
                    <label key={k} className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={cfg.campos.includes(k)}
                        onChange={(e) =>
                          editar(
                            "campos",
                            e.target.checked
                              ? [...cfg.campos, k]
                              : cfg.campos.filter((c) => c !== k),
                          )
                        }
                      />
                      {rotulos[k]}
                    </label>
                  ))}
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  {numero("silencioSegundos", "Segundos de silêncio")}
                  {numero("agrupamentoSegundos", "Limite de agrupamento (até 20 segundos)")}
                  {numero("digitandoMinMs", "Digitando: mínimo em ms")}
                  {numero("digitandoMaxMs", "Digitando: máximo em ms")}
                  {numero("maxMensagens", "Limite de respostas por conversa")}
                  {numero("limiteDiario", "Limite diário de gerações")}
                </div>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={cfg.digitando}
                    onChange={(e) => editar("digitando", e.target.checked)}
                  />
                  Mostrar “digitando”
                </label>
                <div className="space-y-2">
                  <h2 className="font-medium">Horários humanos · São Paulo</h2>
                  {cfg.horarios.map((h, i) => (
                    <div key={i} className="flex flex-wrap gap-2">
                      <select
                        aria-label="Dia"
                        className="rounded border bg-background p-2"
                        value={h.dia}
                        onChange={(e) =>
                          editar(
                            "horarios",
                            cfg.horarios.map((x, j) =>
                              j === i ? { ...x, dia: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      >
                        {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map(
                          (d, k) => (
                            <option value={k} key={d}>
                              {d}
                            </option>
                          ),
                        )}
                      </select>
                      <Input
                        aria-label="Início"
                        className="w-32"
                        type="time"
                        value={h.inicio}
                        onChange={(e) =>
                          editar(
                            "horarios",
                            cfg.horarios.map((x, j) =>
                              j === i ? { ...x, inicio: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <Input
                        aria-label="Fim"
                        className="w-32"
                        type="time"
                        value={h.fim}
                        onChange={(e) =>
                          editar(
                            "horarios",
                            cfg.horarios.map((x, j) =>
                              j === i ? { ...x, fim: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        onClick={() =>
                          editar(
                            "horarios",
                            cfg.horarios.filter((_, j) => i !== j),
                          )
                        }
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() =>
                      editar("horarios", [
                        ...cfg.horarios,
                        { dia: 1, inicio: "09:00", fim: "18:00" },
                      ])
                    }
                  >
                    Adicionar horário
                  </Button>
                </div>
                {texto("disponibilidade", "Mensagem de disponibilidade da equipe", true)}
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={cfg.encaminhamentoRevisado}
                    onChange={(e) => editar("encaminhamentoRevisado", e.target.checked)}
                  />
                  Encaminhamento revisado: preservar vendedor; sem responsável, fila do gestor
                </label>
              </section>
            </TabsContent>
            <TabsContent value="simulador">
              <div className="grid gap-4 lg:grid-cols-2">
                <section className={caixa}>
                  <h2 className="font-semibold">Simulador sem envios</h2>
                  <p className="text-sm text-muted-foreground">
                    Usa o rascunho salvo e o mesmo processamento da operação. Consome IA. Salve
                    alterações antes de testar.
                  </p>
                  <div aria-live="polite" className="max-h-96 space-y-3 overflow-auto">
                    {sim.map((m, i) => (
                      <p key={i} className="rounded-lg bg-muted p-3 text-sm">
                        <strong>{m.role === "user" ? "Lead" : "Agente"}:</strong> {m.content}
                      </p>
                    ))}
                  </div>
                  <Textarea
                    aria-label="Mensagem de teste"
                    value={entrada}
                    onChange={(e) => setEntrada(e.target.value)}
                    placeholder="Tenho um empório em Porto Alegre e queria conhecer os produtos."
                  />
                  <div className="flex gap-2">
                    <Button
                      disabled={
                        !!rascunho || simulador.isPending || !entrada.trim() || sim.length >= 28
                      }
                      onClick={enviarSim}
                    >
                      <Send />
                      Simular
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSim([]);
                        setDados({});
                        setResumo("");
                      }}
                    >
                      Nova conversa
                    </Button>
                  </div>
                  <p className="text-sm">{resumo}</p>
                  {Object.entries(dados).map(
                    ([k, d]) =>
                      d && (
                        <p key={k} className="text-sm">
                          {k}: {d.valor}
                          <span className="block text-muted-foreground">
                            Evidência: “{d.evidencia}”
                          </span>
                        </p>
                      ),
                  )}
                </section>
                <section className={caixa}>
                  <h2 className="font-semibold">Entrada em operação</h2>
                  <p className="text-sm">
                    Publique após revisar conhecimento, horários e simulador. A publicação pausa o
                    agente. Valide um envio em piloto antes de liberar novos contatos.
                  </p>
                  <label className="grid gap-2 text-sm">
                    Números internos autorizados (DDI + DDD, separados por vírgula)
                    <Input
                      value={cfg.pilotos.join(",")}
                      onChange={(e) =>
                        editar(
                          "pilotos",
                          e.target.value
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    Número comercial confirmado
                    <select
                      className="rounded border bg-background p-2"
                      value={vinculo}
                      onChange={(e) => setVinculo(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {vinculos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.numero_comercial}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={!!rascunho || !vinculo || !p.config?.publicada || salvar.isPending}
                      onClick={() => agir("ativar", { modo: "piloto", vinculo })}
                    >
                      Ativar piloto interno
                    </Button>
                    <Button
                      disabled={!!rascunho || !vinculo || !p.config?.publicada || salvar.isPending}
                      onClick={() => agir("ativar", { modo: "ativo", vinculo })}
                    >
                      Ativar novos contatos
                    </Button>
                  </div>
                  <h3 className="font-medium">Versões publicadas</h3>
                  {p.versoes.map((v) => (
                    <details key={v.versao} className="text-sm">
                      <summary>
                        Versão {v.versao} · {new Date(v.created_at).toLocaleString("pt-BR")}
                      </summary>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                        {JSON.stringify(v.config, null, 2)}
                      </pre>
                    </details>
                  ))}
                </section>
              </div>
            </TabsContent>
          </>
        )}
        <TabsContent value="operacao">
          <section className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {p.gestor
                ? "Conversas da empresa. Sem responsável: fila de distribuição do gestor."
                : "Somente conversas dos seus leads."}{" "}
              A revisão abaixo não muda a qualificação oficial do CRM.
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Fila humana", p.indicadores?.filaHumana ?? 0],
                ["Coletas incompletas", p.indicadores?.incompletas ?? 0],
                ["Revisões confirmadas", p.indicadores?.confirmadas ?? 0],
                ["Revisões rejeitadas", p.indicadores?.rejeitadas ?? 0],
              ].map(([label, n]) => (
                <div key={label} className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold">{n}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Produção: {p.consumo?.geracoes ?? 0} processamentos · Piloto:{" "}
              {p.consumo?.geracoesPiloto ?? 0} · Pedidos de humano:{" "}
              {p.indicadores?.pedidosHumano ?? 0} · Falhas: {p.consumo?.falhas ?? 0} · Envios
              incertos: {p.consumo?.incertas ?? 0} · Primeira resposta média:{" "}
              {p.consumo?.primeiraRespostaMs == null
                ? "sem dados"
                : `${(p.consumo.primeiraRespostaMs / 1000).toFixed(1)}s`}
            </p>
            <p className="text-xs text-muted-foreground">
              Indicadores de produção excluem o piloto. Lista: até 100 conversas recentes.
            </p>
            {!p.conversas.length && (
              <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                Nenhuma conversa elegível. O agente começa desativado.
              </p>
            )}
            {p.conversas.map((c) => (
              <article key={c.id} className={caixa}>
                <div className="flex flex-wrap justify-between gap-2">
                  <h2 className="font-semibold">
                    {c.nome_empresa || c.telefone}
                    {c.piloto ? " · Piloto interno" : ""}
                  </h2>
                  <span className="text-sm">
                    {c.estado} · {c.motivo || "coletando"}
                  </span>
                </div>
                <p className="text-sm">
                  {c.responsavel_id
                    ? "Vendedor responsável preservado"
                    : "Fila de distribuição do gestor"}
                </p>
                <p className="text-sm">{c.resumo || "Coleta em andamento"}</p>
                <p className="text-sm text-muted-foreground">
                  Revisão da pré-qualificação: {c.revisao_humana}. A qualificação oficial é feita no
                  CRM.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(c.dados).map(
                    ([k, d]) =>
                      d && (
                        <div key={k} className="rounded border p-2 text-sm">
                          <strong>{rotulos[k as keyof typeof rotulos]}:</strong> {d.valor}
                          <p className="text-muted-foreground">“{d.evidencia}”</p>
                        </div>
                      ),
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={salvar.isPending}
                    onClick={() => agir("assumir", { conversa: c.id })}
                  >
                    Assumir conversa
                  </Button>
                  <Button
                    variant="outline"
                    disabled={salvar.isPending}
                    onClick={() => agir("pausar", { conversa: c.id })}
                  >
                    Pausar agente
                  </Button>
                  <Button
                    variant="outline"
                    disabled={salvar.isPending || c.estado === "bloqueada"}
                    onClick={() => agir("devolver", { conversa: c.id })}
                  >
                    Devolver ao agente
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => agir("revisar", { conversa: c.id, revisaoHumana: "confirmada" })}
                  >
                    Confirmar pré-qualificação
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => agir("revisar", { conversa: c.id, revisaoHumana: "rejeitada" })}
                  >
                    Rejeitar pré-qualificação
                  </Button>
                </div>
                <details className="text-sm">
                  <summary>Mensagens</summary>
                  <div className="max-h-80 space-y-2 overflow-auto">
                    {c.mensagens?.map((m, i) => (
                      <p key={i} className="rounded bg-muted p-2">
                        <strong>{m.direcao === "recebida" ? "Lead" : "Atendimento"}:</strong>{" "}
                        {m.texto}
                        {m.referencia_anuncio && (
                          <span className="block text-xs text-muted-foreground">
                            Referência de anúncio recebida: {m.referencia_anuncio.id}
                          </span>
                        )}
                      </p>
                    ))}
                  </div>
                </details>
                <RespostaManualAgente conversa={c.id} />
                <details className="text-sm">
                  <summary>Processamento e falhas</summary>
                  {c.fila.map((f) => (
                    <p key={f.id}>
                      {f.estado} · {f.motivo} · {f.geracoes} processamento ·{" "}
                      {f.latencia_ms === null
                        ? "aguardando"
                        : `${(f.latencia_ms / 1000).toFixed(1)}s`}
                    </p>
                  ))}
                </details>
              </article>
            ))}
            {p.gestor && (
              <details className={caixa}>
                <summary>Histórico de alterações</summary>
                {p.historico.map((h) => (
                  <p key={h.id} className="text-sm">
                    {new Date(h.created_at).toLocaleString("pt-BR")} · {h.acao} ·{" "}
                    {h.ator_id ?? "sistema"}
                  </p>
                ))}
              </details>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
