import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useMimoDebounce } from "@/lib/use-mimo-debounce";
import { useState, useEffect, useRef } from "react";
import { atualizarPedidoAutomatico } from "@/lib/mimo-pedido-automatico";
import { ultimaEntregaClienteMimo } from "@/lib/mimo-frete.functions";
import { useServerFn } from "@tanstack/react-start";
import { AcoesPedido, HistoricoPedido, PropostasPedido } from "@/components/mimo-pedido-acoes";
import { TabelaProdutosPedido } from "@/components/mimo-pedido-itens";
import {
  Plus,
  Gift,
  Save,
  ArrowLeft,
  FileDown,
  Copy,
  MessageCircle,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Escolha, MimoLeadEditor } from "@/components/mimo-lead-editor";
import { CampoNumero, LogisticaPedido } from "@/components/mimo-pedido-logistica";
import {
  adicionarDiaBoleto,
  calcularPedido,
  CAMPOS_FATURAMENTO,
  carregarModelo,
  DIA_BOLETO_MAXIMO,
  dinheiro,
  itemDeProduto,
  LIMITES_FATURAMENTO,
  novoPedido,
  pendenciasPedido,
  PRAZOS_BOLETO,
  removerDiaBoleto,
  validarSalvar,
  STATUS,
  vencimentosBoleto,
  type Faturamento,
  type Pedido,
  type PedidoSalvo,
} from "@/lib/mimo-pedido";
import {
  carregarTiraMimo,
  buscarClientesTiraMimo,
  historicoPedidoMimo,
  receberPedidoMimo,
  salvarPedidoMimo,
} from "@/lib/mimo-pedido.functions";
import {
  opcoesStatus,
  podeEditarComercial,
  ehGestao,
  itemDeBrinde,
  podeConfirmarRecebimento,
} from "@/lib/mimo-tira-regras";
import { gerarPdfProposta, mensagemWhatsApp, linkWhatsApp } from "@/lib/mimo-proposta";
import { useMimoRascunho } from "@/lib/use-mimo-rascunho";
export type ContextoTira = Awaited<ReturnType<typeof carregarTiraMimo>>;

export function EditorPedido({
  contexto,
  atual,
  onClose,
  onSaved,
  refresh,
  leadInicial,
}: {
  leadInicial?: {
    id: string;
    nome_empresa: string;
    responsavel_id: string | null;
  };
  contexto: ContextoTira;
  atual: PedidoSalvo | null;
  onClose: () => void;
  onSaved: (salvo?: { id: string; novo: boolean }) => void;
  refresh: () => void;
}) {
  const [p, setP] = useState<Pedido>(() =>
    atual
      ? structuredClone(atual.documento)
      : {
          ...novoPedido(),
          ...(leadInicial
            ? {
                leadId: leadInicial.id,
                cliente: leadInicial.nome_empresa,
                responsavelId: leadInicial.responsavel_id,
              }
            : {}),
        },
  );
  const [id, setId] = useState(atual?.id ?? crypto.randomUUID());
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [tab, setTab] = useState("itens");
  const [novoLead, setNovoLead] = useState(false);
  const [modelo, setModelo] = useState("");
  const [produto, setProduto] = useState("");
  const [brinde, setBrinde] = useState("");
  const [manual, setManual] = useState("");
  const [brindeReutilizavel, setBrindeReutilizavel] = useState("");
  const editavel = !atual || podeEditarComercial(atual.status);
  // Sem escolha, o pedido responde ao responsável do cliente; só a gestão define outro.
  const equipe = Object.fromEntries(contexto.responsaveis.map((r) => [r.id, r.nome]));
  const opcoesResponsavel = {
    "": `Mesmo do cliente (${p.responsavelId ? (equipe[p.responsavelId] ?? "membro inativo") : "sem responsável"})`,
    ...equipe,
    ...(p.responsavelPedidoId && !equipe[p.responsavelPedidoId]
      ? { [p.responsavelPedidoId]: "Responsável atual (inativo)" }
      : {}),
  };
  const [buscaCliente, setBuscaCliente] = useState("");
  const telaRascunho = { tab, modelo, produto, brinde, manual, brindeReutilizavel, buscaCliente };
  const baseRascunho = useRef(JSON.stringify({ pedidoId: id, documento: p, tela: telaRascunho }));
  const rascunho = useMimoRascunho({
    escopo: {
      empresaId: contexto.empresaId,
      usuarioId: contexto.usuarioId,
      papel: contexto.papel,
      pedidoRef: atual?.id ?? null,
    },
    valor: { pedidoId: id, documento: p, tela: telaRascunho },
    base: baseRascunho.current,
    versaoBase: atual?.versao ?? 0,
    editavel,
    leadInicial: leadInicial?.id,
    restaurar: (r) => {
      setP({ ...r.documento, ...(atual ? { status: atual.status, leadId: atual.lead_id } : {}) });
      if (!atual) setId(r.pedidoId);
      setTab(r.tela.tab);
      setModelo(r.tela.modelo);
      setProduto(r.tela.produto);
      setBrinde(r.tela.brinde);
      setManual(r.tela.manual);
      setBrindeReutilizavel(r.tela.brindeReutilizavel);
      setBuscaCliente(r.tela.buscaCliente);
    },
  });
  const buscaClienteDebounced = useMimoDebounce(buscaCliente);
  const buscarCliente = useServerFn(buscarClientesTiraMimo);
  const clientesQuery = useQuery({
    queryKey: ["mimo-tira-clientes", contexto.usuarioId, buscaClienteDebounced],
    queryFn: () => buscarCliente({ data: { busca: buscaClienteDebounced } }),
    enabled: !atual && buscaClienteDebounced.trim().length >= 2,
    placeholderData: keepPreviousData,
  });
  const clientesDisponiveis = [...contexto.leads, ...(clientesQuery.data ?? [])];
  const [valorRecebido, setValorRecebido] = useState<number | null>(atual?.total ?? null);
  const salvar = useServerFn(salvarPedidoMimo),
    receber = useServerFn(receberPedidoMimo);
  let resultado: ReturnType<typeof calcularPedido> | null = null;
  try {
    resultado = calcularPedido(p);
  } catch {}
  const pendencias = pendenciasPedido(p, atual?.pix ?? null);
  const alterar = (v: Partial<Pedido>) => {
    if (!editavel) return;
    try {
      setP(atualizarPedidoAutomatico(p, v, contexto.caixas));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Confira os valores do pedido.");
    }
  };
  const cliente = clientesDisponiveis.find((l) => l.id === p.leadId);
  const executar = async (fn: () => Promise<void>) => {
    setErro("");
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      const m = e instanceof Error ? e.message.trim() : "";
      // Erros de esquema chegam como JSON técnico; mostra orientação legível.
      setErro(!m ? "Não foi possível concluir." : m.startsWith("[") || m.startsWith("{") ? "Há campos inválidos no pedido. Confira itens, valores e endereço." : m);
    } finally {
      setOcupado(false);
    }
  };
  function adicionar(codigo: string, bonificado = false, quantidade = 1) {
    try {
      const pr = contexto.catalogo.find((x) => x.codigo === codigo);
      if (!pr) throw new Error("Escolha um produto.");
      alterar({ itens: [...p.itens, itemDeProduto(pr, quantidade, bonificado)] });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Produto indisponível.");
    }
  }
  const [prazoLivre, setPrazoLivre] = useState("");
  // Os auxiliares validam, ordenam e impedem lista vazia, repetida ou acima de 6 vencimentos.
  function alterarDiasBoleto(calcular: () => string[]) {
    try {
      const diasBoleto = calcular();
      setErro("");
      alterar({ pagamento: { ...p.pagamento, diasBoleto } });
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Confira os vencimentos do boleto.");
      return false;
    }
  }
  function adicionarPrazoLivre() {
    if (alterarDiasBoleto(() => adicionarDiaBoleto(p.pagamento.diasBoleto, prazoLivre)))
      setPrazoLivre("");
  }
  const alterarFaturamento = (campo: keyof Faturamento, valor: string) =>
    alterar({ faturamento: { ...p.faturamento, [campo]: valor } });
  const buscarEntrega = useServerFn(ultimaEntregaClienteMimo);
  const entrega = useQuery({
    queryKey: ["mimo-ultima-entrega", contexto.usuarioId, p.leadId],
    queryFn: () => buscarEntrega({ data: { leadId: p.leadId! } }),
    enabled: !atual && !!p.leadId,
    staleTime: 300000,
    retry: false,
  });
  const preenchido = useRef<string | null>(null);
  useEffect(() => {
    preenchido.current = null;
  }, [p.leadId]);
  useEffect(() => {
    if (
      !atual &&
      entrega.data &&
      entrega.data.leadId === p.leadId &&
      preenchido.current !== p.leadId
    ) {
      preenchido.current = p.leadId;
      const dados = entrega.data;
      setP((atual) =>
        atual.leadId === dados.leadId
          ? {
              ...atual,
              destinoCep: atual.destinoCep || dados.destinoCep,
              endereco: atual.endereco || dados.endereco,
            }
          : atual,
      );
    }
  }, [entrega.data, p.leadId, atual]);
  const dadosProposta = {
    numero: atual ? String(atual.numero) : "RASCUNHO NÃO SALVO",
    versao: atual?.versao ?? 0,
    cliente: cliente?.nome_empresa ?? p.cliente,
    pedido: p,
  };
  const mensagemGerada = mensagemWhatsApp(dadosProposta);
  const [mensagemEditada, setMensagemEditada] = useState<{ pedidoId: string; texto: string } | null>(null);
  // Edição vale só para este pedido; outro pedido sempre parte do texto gerado.
  const mensagemCliente = mensagemEditada?.pedidoId === id ? mensagemEditada.texto : mensagemGerada;
  const salvoIgual = !!atual && JSON.stringify(p) === JSON.stringify(atual.documento);
  const bloqueioSalvar = !contexto.disponivel
    ? "Gravação indisponível neste ambiente: o pedido não pode ser salvo agora."
    : !editavel
      ? "Este pedido não pode mais ser editado."
      : rascunho.bloqueado
        ? "Conclua a recuperação do rascunho antes de salvar."
        : "";
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Voltar aos pedidos" onClick={onClose}>
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-2xl">{atual ? `Pedido #${atual.numero}` : "Novo pedido MiMo"}</h1>
            <p className="text-xs text-muted-foreground">
              {atual
                ? `Versão ${atual.versao} · ${new Date(atual.updated_at).toLocaleString("pt-BR")}`
                : "Rascunho em edição"}
            </p>
          </div>
        </div>
        <Button
          disabled={!contexto.disponivel || ocupado || !editavel || rascunho.bloqueado}
          onClick={() =>
            void executar(async () => {
              // Pré-checagem local: o servidor repete todas as validações.
              validarSalvar(p, atual?.pix ?? null);
              const r = await salvar({
                data: { id, versao: atual?.versao ?? 0, pedido: p },
              });
              rascunho.limpar();
              onSaved({ id: r.id, novo: !atual });
            })
          }
        >
          <Save />
          {ocupado ? "Salvando…" : "Salvar pedido"}
        </Button>
        {(erro || bloqueioSalvar) && (
          <p role="alert" className="basis-full text-right text-sm text-destructive">
            {erro || bloqueioSalvar}
          </p>
        )}
      </header>
      {editavel && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
          <p
            role="status"
            className={rascunho.status === "falha" ? "text-destructive" : "text-muted-foreground"}
          >
            {rascunho.status === "restaurando"
              ? "Recuperando rascunho…"
              : rascunho.status === "salvando"
                ? "Salvando rascunho…"
                : rascunho.mensagem ||
                  "As alterações ficam salvas automaticamente neste navegador."}
          </p>
          <div className="flex gap-2">
            {rascunho.status === "revisar" && (
              <Button variant="outline" onClick={rascunho.recuperar}>
                Recuperar para conferir
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={ocupado}
              onClick={() => {
                if (window.confirm("Descartar apenas as alterações não salvas deste rascunho?")) {
                  rascunho.limpar();
                  onClose();
                }
              }}
            >
              Descartar rascunho
            </Button>
          </div>
        </div>
      )}
      {rascunho.bloqueado ? (
        <p role="status" className="py-8 text-sm text-muted-foreground">
          Aguarde a recuperação ou escolha o que fazer com o rascunho anterior.
        </p>
      ) : (
        <>
          {!contexto.disponivel && (
            <p role="status" className="rounded-md border border-border bg-accent p-3 text-sm">
              Gravação indisponível: as novas estruturas aguardam confirmação do backup e aplicação
              segura. A edição abaixo não cria registros.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {!atual && (
              <label className="grid gap-1 text-xs">
                Pesquisar cliente
                <Input
                  aria-label="Pesquisar cliente pelo nome"
                  placeholder="Digite ao menos 2 letras"
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                />
                {clientesQuery.isFetching && <span role="status">Buscando clientes…</span>}
                {clientesQuery.isError && (
                  <span role="alert">Não foi possível buscar clientes.</span>
                )}
              </label>
            )}
            <Escolha
              label="Cliente / lead *"
              value={p.leadId ?? ""}
              disabled={!!atual}
              opcoes={{
                "": "Selecionar cliente",
                ...Object.fromEntries(clientesDisponiveis.map((l) => [l.id, l.nome_empresa])),
                ...(p.leadId ? { [p.leadId]: p.cliente } : {}),
              }}
              onChange={(v) => {
                const l = clientesDisponiveis.find((l) => l.id === v);
                alterar({
                  leadId: v || null,
                  cliente: l?.nome_empresa ?? "",
                  responsavelId: l?.responsavel_id ?? null,
                  destinoCep: "",
                  endereco: "",
                  cotacaoId: null,
                  cotacoes: [],
                });
              }}
            />
            <div className="flex items-end">
              <Button
                variant="outline"
                disabled={!contexto.disponivel || !editavel}
                onClick={() => setNovoLead(true)}
              >
                <Plus />
                Novo lead
              </Button>
            </div>
            <Escolha
              label="Responsável pelo pedido"
              value={p.responsavelPedidoId ?? ""}
              disabled={!ehGestao(contexto.papel) || !editavel}
              opcoes={opcoesResponsavel}
              onChange={(v) => alterar({ responsavelPedidoId: v || null })}
            />
            <p className="self-end py-2 text-sm text-muted-foreground">
              Situação: {STATUS[p.status]}
            </p>
          </div>
          <AcoesPedido
            atual={atual}
            pedido={p}
            contexto={contexto}
            igual={salvoIgual}
            ocupado={ocupado}
            executar={executar}
            onSaved={onSaved}
          />
          {!editavel && (
            <p role="status" className="text-sm text-muted-foreground">
              Pedido {STATUS[p.status]}: edição comercial bloqueada.
            </p>
          )}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto">
              <TabsTrigger value="itens">Produtos e brindes</TabsTrigger>
              <TabsTrigger value="logistica">Entrega e frete</TabsTrigger>
              <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
              <TabsTrigger value="proposta">Proposta</TabsTrigger>
              <TabsTrigger value="historico" disabled={!atual}>
                Histórico
              </TabsTrigger>
            </TabsList>
            <TabsContent value="itens" className="space-y-5 pt-3">
              <fieldset disabled={!editavel} className="space-y-5 min-w-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Escolha
                    label="Modelo de PDV"
                    value={modelo}
                    opcoes={{
                      "": "Escolher modelo",
                      ...Object.fromEntries(contexto.modelos.map((m) => [m.id, m.nome])),
                    }}
                    onChange={(codigo) => {
                      const m = contexto.modelos.find((m) => m.id === codigo);
                      if (
                        !m ||
                        (p.itens.length &&
                          !window.confirm("Substituir os itens pelo modelo escolhido?"))
                      )
                        return;
                      try {
                        alterar({ itens: carregarModelo(m, contexto.catalogo), volumes: [] });
                        setModelo(codigo);
                      } catch (e) {
                        setErro(e instanceof Error ? e.message : "Modelo indisponivel.");
                      }
                    }}
                  />
                </div>
                <TabelaProdutosPedido
                  catalogo={contexto.catalogo}
                  itens={p.itens}
                  totalProdutos={resultado?.produtos ?? null}
                  editavel={editavel}
                  podeVerCustoBrinde={ehGestao(contexto.papel)}
                  onAlterarItens={(itens) => alterar({ itens })}
                  onAdicionarProduto={(codigo, quantidade) => adicionar(codigo, false, quantidade)}
                />
                <details className="border-y border-border py-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Adicionar brindes ou bonificações
                  </summary>
                  <section className="pt-4">
                    <h2 className="mb-3 flex items-center gap-2 text-lg">
                      <Gift className="text-primary" />
                      Bonificações
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Escolha
                        label="Produto bonificado"
                        value={brinde}
                        opcoes={{
                          "": "Escolher brinde",
                          ...Object.fromEntries(
                            contexto.catalogo.filter((p) => p.ativo).map((p) => [p.codigo, p.nome]),
                          ),
                        }}
                        onChange={setBrinde}
                      />
                      <Button
                        variant="outline"
                        className="self-end"
                        onClick={() => adicionar(brinde, true)}
                      >
                        <Gift />
                        Adicionar bonificação
                      </Button>
                      <Escolha
                        label="Brinde reutilizável"
                        value={brindeReutilizavel}
                        opcoes={{
                          "": "Selecionar brinde",
                          ...Object.fromEntries(
                            contexto.brindes.filter((b) => b.ativo).map((b) => [b.id, b.nome]),
                          ),
                        }}
                        onChange={setBrindeReutilizavel}
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          const b = contexto.brindes.find((b) => b.id === brindeReutilizavel);
                          if (b) alterar({ itens: [...p.itens, itemDeBrinde(b)] });
                          else setErro("Selecione um brinde.");
                        }}
                      >
                        <Gift />
                        Adicionar brinde cadastrado
                      </Button>
                      <Input
                        aria-label="Nome do brinde externo"
                        placeholder="Nome do brinde externo"
                        value={manual}
                        onChange={(e) => setManual(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (!manual.trim()) {
                            setErro("Informe o nome do brinde.");
                            return;
                          }
                          alterar({
                            itens: [
                              ...p.itens,
                              {
                                id: crypto.randomUUID(),
                                codigo: "",
                                nome: manual.trim(),
                                unidade: "Unidade",
                                tipo: "outro",
                                quantidade: 1,
                                precoOriginal: 0,
                                precoNegociado: 0,
                                desconto: { modo: "percentual", valor: 0 },
                                brinde: true,
                                custoInterno: null,
                                pesoG: null,
                                envioSeparado: true,
                              },
                            ],
                          });
                          setManual("");
                        }}
                      >
                        <Plus />
                        Brinde externo
                      </Button>
                    </div>
                  </section>
                </details>
                <details className="rounded-md border border-border px-3 py-3">
                  <summary className="cursor-pointer text-sm">Adicionar outra linha de produto</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Escolha
                      label="Adicionar produto"
                      value={produto}
                      opcoes={{
                        "": "Escolher produto",
                        ...Object.fromEntries(
                          contexto.catalogo
                            .filter((p) => p.ativo)
                            .map((p) => [p.codigo, `${p.nome} · ${dinheiro(p.preco ?? 0)}`]),
                        ),
                      }}
                      onChange={setProduto}
                    />
                    <Button className="self-end" variant="outline" onClick={() => adicionar(produto)}>
                      <Plus />
                      Adicionar produto
                    </Button>
                  </div>
                </details>
                <details>
                  <summary className="cursor-pointer text-sm">Aplicar desconto no pedido</summary>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Escolha
                      label="Desconto geral"
                      value={p.descontoGeral.modo}
                      opcoes={{
                        percentual: "Percentual sobre produtos",
                        fixo: "Valor fixo sobre produtos",
                      }}
                      onChange={(v) =>
                        alterar({
                          descontoGeral: {
                            modo: v as "fixo" | "percentual",
                            valor: 0,
                          },
                        })
                      }
                    />
                    <CampoNumero
                      imediato
                      label={`Valor desconto geral (${p.descontoGeral.modo === "fixo" ? "R$" : "%"})`}
                      moeda
                      valor={p.descontoGeral.valor}
                      onChange={(v) =>
                        alterar({
                          descontoGeral: { ...p.descontoGeral, valor: v ?? 0 },
                        })
                      }
                    />
                  </div>
                </details>
              </fieldset>
            </TabsContent>
            <TabsContent value="logistica" className="pt-4">
              <fieldset disabled={!editavel} className="min-w-0">
                <LogisticaPedido
                  pedido={p}
                  caixas={contexto.caixas}
                  onChange={setP}
                  avisar={setErro}
                  jadlogConfigurada={contexto.jadlogConfigurada ?? false}
                  frenetConfigurada={contexto.frenetConfigurada ?? false}
                  gerenciarOrigem={ehGestao(contexto.papel)}
                  pedidoId={atual?.id}
                  editavel={editavel}
                  usuarioId={contexto.usuarioId}
                />
              </fieldset>
            </TabsContent>
            <TabsContent value="pagamento" className="space-y-5 pt-4">
              <fieldset disabled={!editavel} className="space-y-5 min-w-0">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Escolha
                    label="Forma de pagamento"
                    value={p.pagamento.forma}
                    opcoes={{
                      pix: "PIX antecipado",
                      cartao: "Cartão",
                      boleto: "Boleto",
                    }}
                    onChange={(v) =>
                      alterar({
                        pagamento: {
                          ...p.pagamento,
                          forma: v as Pedido["pagamento"]["forma"],
                          taxaBps: contexto.taxas[p.pagamento.parcelas - 1] ?? 313,
                        },
                      })
                    }
                  />
                  {p.pagamento.forma === "cartao" && (
                    <Escolha
                      label="Parcelamento do cartão"
                      value={String(p.pagamento.parcelas)}
                      opcoes={Object.fromEntries(
                        Array.from({ length: 12 }, (_, i) => [
                          String(i + 1),
                          `${i + 1}x · ${(contexto.taxas[i] ?? 0) / 100}%`,
                        ]),
                      )}
                      onChange={(v) =>
                        alterar({
                          pagamento: {
                            ...p.pagamento,
                            parcelas: Number(v),
                            taxaBps: contexto.taxas[Number(v) - 1] ?? 313,
                          },
                        })
                      }
                    />
                  )}
                  <details>
                    <summary className="cursor-pointer text-xs">Data de faturamento</summary>{" "}
                    <label className="grid gap-1 text-xs">
                      Faturamento registrado em
                      <Input
                        aria-label="Data de faturamento"
                        type="date"
                        disabled={!ehGestao(contexto.papel)}
                        value={p.pagamento.faturadoEm ?? ""}
                        onChange={(e) =>
                          alterar({
                            pagamento: {
                              ...p.pagamento,
                              faturadoEm: e.target.value || null,
                            },
                          })
                        }
                      />
                    </label>
                  </details>
                </div>
                {p.pagamento.forma === "boleto" && (
                  <fieldset>
                    <legend className="text-sm">Vencimentos negociados desde o faturamento</legend>
                    <div className="mt-3 flex flex-wrap gap-5">
                      {PRAZOS_BOLETO.map(String).map((d) => (
                        <label key={d} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={p.pagamento.diasBoleto.includes(d)}
                            onChange={(e) => {
                              const marcado = e.target.checked;
                              alterarDiasBoleto(() =>
                                marcado
                                  ? adicionarDiaBoleto(p.pagamento.diasBoleto, d)
                                  : removerDiaBoleto(p.pagamento.diasBoleto, d),
                              );
                            }}
                          />
                          {d} dias
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-end gap-2">
                      <label className="grid gap-1 text-xs">
                        Outro prazo (dias)
                        <Input
                          aria-label="Outro prazo do boleto (dias)"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={DIA_BOLETO_MAXIMO}
                          step={1}
                          className="w-28"
                          value={prazoLivre}
                          onChange={(e) => setPrazoLivre(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            adicionarPrazoLivre();
                          }}
                        />
                      </label>
                      <Button type="button" variant="outline" onClick={adicionarPrazoLivre}>
                        <Plus />
                        Adicionar prazo
                      </Button>
                    </div>
                    <ul aria-label="Vencimentos do boleto" className="mt-3 flex flex-wrap gap-2">
                      {p.pagamento.diasBoleto.map((d) => (
                        <li
                          key={d}
                          className="flex items-center gap-1 rounded-full border border-border bg-accent py-1 pl-3 pr-1 text-sm"
                        >
                          {d} {d === "1" ? "dia" : "dias"}
                          <button
                            type="button"
                            aria-label={`Remover vencimento de ${d} ${d === "1" ? "dia" : "dias"}`}
                            title={
                              p.pagamento.diasBoleto.length === 1
                                ? "Mantenha ao menos um vencimento."
                                : undefined
                            }
                            disabled={p.pagamento.diasBoleto.length === 1}
                            className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() =>
                              alterarDiasBoleto(() => removerDiaBoleto(p.pagamento.diasBoleto, d))
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {resultado && (
                      <ul className="mt-4 space-y-2 text-sm">
                        {vencimentosBoleto(
                          resultado.total,
                          p.pagamento.diasBoleto,
                          p.pagamento.faturadoEm,
                        ).map((v) => (
                          <li key={v.dias}>
                            {v.dias} {v.dias === 1 ? "dia" : "dias"} · {dinheiro(v.valor)} ·{" "}
                            {v.vencimento ?? "Aguardando faturamento"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </fieldset>
                )}
                {p.pagamento.forma === "cartao" && resultado && (
                  <div className="border-y border-border py-4 text-sm">
                    <p>Tarifa da operadora: {dinheiro(resultado.tarifa)}</p>
                    <p>Diferença absorvida sobre o frete: {dinheiro(resultado.absorvido)}</p>
                    <p className="mt-2">Parcelas: {resultado.parcelas.map(dinheiro).join(" + ")}</p>
                  </div>
                )}
                <section
                  aria-label="Dados para faturamento"
                  className="space-y-3 border-t border-border pt-5"
                >
                  <h2 className="text-lg">Dados para faturamento</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {CAMPOS_FATURAMENTO.map(({ campo, rotulo }) => (
                      <label key={campo} className="grid gap-1 text-xs">
                        {rotulo}
                        <Input
                          aria-label={rotulo}
                          value={p.faturamento[campo]}
                          maxLength={LIMITES_FATURAMENTO[campo]}
                          autoComplete="off"
                          spellCheck={campo === "razaoSocial"}
                          inputMode={
                            campo === "email" ? "email" : campo === "telefone" ? "tel" : undefined
                          }
                          onChange={(e) => alterarFaturamento(campo, e.target.value)}
                          onBlur={(e) => {
                            // Espaços internos ficam durante a digitação; as pontas saem ao sair do campo.
                            const valor = e.target.value.trim();
                            if (valor !== p.faturamento[campo]) alterarFaturamento(campo, valor);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              </fieldset>
              {atual && (
                <section className="space-y-3 border-t border-border pt-5">
                  <h2 className="text-lg">Recebimentos registrados</h2>
                  <ul className="text-sm">
                    {atual.recebimentos.map(
                      (r, i) =>
                        r && (
                          <li key={i}>
                            {dinheiro(r.valor)} · {new Date(r.confirmadoEm).toLocaleString("pt-BR")}
                          </li>
                        ),
                    )}
                  </ul>
                  <CampoNumero
                    imediato
                    label="Recebimento a confirmar (R$)"
                    moeda
                    valor={valorRecebido}
                    onChange={setValorRecebido}
                  />
                  <Button
                    disabled={
                      !contexto.disponivel ||
                      !salvoIgual ||
                      ocupado ||
                      !valorRecebido ||
                      !podeConfirmarRecebimento(contexto.papel, atual.status)
                    }
                    onClick={() =>
                      void executar(async () => {
                        if (!window.confirm("Confirmar que este valor foi efetivamente recebido?"))
                          return;
                        await receber({
                          data: {
                            id,
                            versao: atual.versao,
                            operacao: crypto.randomUUID(),
                            valor: valorRecebido ?? 0,
                          },
                        });
                        onSaved();
                      })
                    }
                  >
                    <Check />
                    {p.pagamento.forma === "pix"
                      ? "Confirmar pagamento PIX"
                      : "Confirmar recebimento manual"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {atual.pix
                      ? "PIX confirmado e registrado."
                      : p.pagamento.forma === "pix"
                        ? "PIX integral não confirmado: faturamento e envio bloqueados."
                        : ""}
                    {!ehGestao(contexto.papel)
                      ? " Somente administradores e gestores podem confirmar recebimentos."
                      : ""}
                  </p>
                </section>
              )}
            </TabsContent>
            <TabsContent value="proposta" className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">
                {salvoIgual
                  ? `Pedido #${atual?.numero} · versão ${atual?.versao}`
                  : "Prévia não salva — não representa uma versão registrada"}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() =>
                    void executar(async () => {
                      const blob = await gerarPdfProposta(dadosProposta);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `proposta-mimo-${dadosProposta.numero}-v${dadosProposta.versao}.pdf`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    })
                  }
                >
                  <FileDown />
                  Gerar PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void executar(async () => {
                      await navigator.clipboard.writeText(mensagemCliente);
                      setErro("Mensagem copiada.");
                    })
                  }
                >
                  <Copy />
                  Copiar mensagem
                </Button>
                <Button
                  variant="outline"
                  disabled={!salvoIgual || !cliente?.telefone}
                  onClick={() => {
                    window.open(
                      linkWhatsApp(cliente?.telefone ?? "", mensagemCliente),
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                >
                  <MessageCircle />
                  Abrir WhatsApp
                </Button>
              </div>
              <Textarea
                aria-label="Mensagem para o cliente (editável)"
                rows={16}
                value={mensagemCliente}
                onChange={(e) => setMensagemEditada({ pedidoId: id, texto: e.target.value })}
              />
              {mensagemCliente !== mensagemGerada && (
                <Button variant="ghost" size="sm" onClick={() => setMensagemEditada(null)}>
                  Restaurar texto gerado
                </Button>
              )}
              <PropostasPedido
                atual={atual}
                contexto={contexto}
                igual={salvoIgual}
                executar={executar}
              />
            </TabsContent>
            <TabsContent value="historico" className="pt-4">
              <HistoricoPedido
                atual={atual}
                contexto={contexto}
                executar={executar}
                onSaved={onSaved}
              />
            </TabsContent>
          </Tabs>
          <label className="grid gap-2 text-sm">
            Observações comerciais
            <Textarea
              disabled={!editavel}
              aria-label="Observações comerciais"
              value={p.observacoes}
              maxLength={10000}
              onChange={(e) => alterar({ observacoes: e.target.value })}
            />
          </label>
          <footer className="border-y border-border bg-card px-4 py-5">
            <details key={tab} open={tab !== "itens"}>
              <summary className="mb-3 cursor-pointer text-sm font-medium">Resumo financeiro</summary>
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Produtos líquidos</p>
                  <strong>{dinheiro(resultado?.produtos ?? 0)}</strong>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Descontos</p>
                  <strong>{dinheiro(resultado?.descontos ?? 0)}</strong>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Frete ao cliente</p>
                  <strong>{dinheiro(resultado?.freteCliente ?? 0)}</strong>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total cobrado</p>
                  <strong className="text-xl text-primary">
                    {resultado ? dinheiro(resultado.total) : "Valor inválido"}
                  </strong>
                </div>
              </div>
            </details>
            {pendencias.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {pendencias.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </footer>
          {erro && (
            <p role="alert" className="rounded-md border border-border bg-accent p-3 text-sm">
              {erro}
            </p>
          )}
          {novoLead && contexto.disponivel && (
            <MimoLeadEditor
              lead={null}
              usuarioId={contexto.usuarioId}
              vendedor={contexto.papel === "vendedor"}
              podeEditar
              membros={{ [contexto.usuarioId]: "Você" }}
              onClose={() => setNovoLead(false)}
              onSaved={() => {
                setNovoLead(false);
                refresh();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
