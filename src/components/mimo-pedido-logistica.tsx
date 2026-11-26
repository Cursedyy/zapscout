import { CAIXAS_PADRAO, caixaConfere, type CaixaTipo } from "@/lib/mimo-tira-regras";
import { useState, useRef, useEffect, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMimoDebounce } from "@/lib/use-mimo-debounce";
import { cotarFreteMimo, confirmarOrigemFreteMimo } from "@/lib/mimo-frete.functions";
import { compararFretes, postagemConfirmada } from "@/lib/mimo-frete";
import { Plus, Package, Trash2, Copy, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Escolha } from "@/components/mimo-lead-editor";
import {
  caixaDoVolume,
  avaliarVolume,
  conferirDistribuicao,
  ehEnvioSeparado,
  itensRemessaPrincipal,
  normalizarRemessaPrincipal,
  sugerirCaixas,
  moverItem,
  assinaturaFrete,
  centavos,
  dinheiro,
  valorCotacao,
  type Pedido,
  type Cotacao,
  volumeSchema,
} from "@/lib/mimo-pedido";

function ConfirmarOrigemCotacao({
  cotacao,
  origemCep,
  disabled,
  confirmar,
}: {
  cotacao: Cotacao;
  origemCep: string;
  disabled: boolean;
  confirmar: (tipo: "postagem" | "coleta", descricao: string) => Promise<void>;
}) {
  const [aberta, setAberta] = useState(false);
  const [tipo, setTipo] = useState<"postagem" | "coleta">("postagem");
  const [descricao, setDescricao] = useState(
    `Local padrão de ${cotacao.transportadora || cotacao.modalidade} definido na Frenet para ${origemCep}`,
  );
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  if (!aberta)
    return (
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setAberta(true)}>
        Confirmar origem
      </Button>
    );
  return (
    <div
      className="w-full space-y-3 rounded-lg border p-3"
      aria-label={`Confirmar origem de ${cotacao.modalidade}`}
    >
      <p className="text-sm">
        Confirme somente o serviço que você configurou na Frenet. Esta confirmação vale para esta
        cotação e será registrada ao salvar o pedido.
      </p>
      <label className="grid gap-1 text-xs">
        Como será o envio?
        <select
          aria-label="Tipo de origem"
          className="rounded-md border bg-background p-2"
          value={tipo}
          disabled={enviando || disabled}
          onChange={(e) => setTipo(e.target.value as "postagem" | "coleta")}
        >
          <option value="postagem">Postagem no ponto definido na Frenet</option>
          <option value="coleta">Coleta confirmada com a transportadora</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        Ponto de postagem ou coleta
        <Input
          aria-label="Ponto de postagem ou coleta"
          value={descricao}
          maxLength={300}
          disabled={enviando || disabled}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmado}
          disabled={enviando || disabled}
          onChange={(e) => setConfirmado(e.target.checked)}
        />
        Confirmo que este serviço tem ponto de postagem ou coleta definido na Frenet para{" "}
        {origemCep}.
      </label>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled || enviando || !confirmado || descricao.trim().length < 3}
          onClick={async () => {
            setEnviando(true);
            setErro("");
            try {
              await confirmar(tipo, descricao.trim());
            } catch (e) {
              setErro(e instanceof Error ? e.message : "Não foi possível confirmar a origem.");
            } finally {
              setEnviando(false);
            }
          }}
        >
          {enviando ? "Confirmando…" : "Confirmar e selecionar frete"}
        </Button>
        <Button
          variant="ghost"
          disabled={enviando}
          onClick={() => {
            setAberta(false);
            setConfirmado(false);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function CampoNumero({
  label,
  valor,
  onChange,
  moeda = false,
  min = 0,
  imediato = false,
}: {
  label: string;
  valor: number | null;
  onChange: (n: number | null) => void;
  moeda?: boolean;
  min?: number;
  imediato?: boolean;
}) {
  const [texto, setTexto] = useState(
    valor === null ? "" : moeda ? (valor / 100).toFixed(2) : String(valor),
  );
  const [erro, setErro] = useState("");
  const focado = useRef(false);
  useEffect(() => {
    if (!focado.current)
      setTexto(valor === null ? "" : moeda ? (valor / 100).toFixed(2) : String(valor));
  }, [valor, moeda]);
  return (
    <label className="grid min-w-0 gap-1 text-xs">
      {label}
      <Input
        aria-label={label}
        inputMode={moeda ? "decimal" : "numeric"}
        value={texto}
        onFocus={() => {
          focado.current = true;
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setErro("");
          if (imediato) {
            try {
              const raw = e.target.value;
              const n =
                raw === "" ? null : moeda ? centavos(raw) : /^\d+$/.test(raw) ? Number(raw) : NaN;
              if (n === null || (Number.isSafeInteger(n) && n >= min)) onChange(n);
            } catch {
              /* Mantém o texto intermediário até a conferência do campo. */
            }
          }
        }}
        onBlur={() => {
          focado.current = false;
          try {
            if (!texto) {
              onChange(null);
              return;
            }
            const n = moeda ? centavos(texto) : Number(texto);
            if (!Number.isInteger(n) || n < min) throw new Error(`Mínimo ${min}.`);
            onChange(n);
          } catch (e) {
            setErro(e instanceof Error ? e.message : "Valor inválido.");
          }
        }}
      />
      {erro && (
        <span role="alert" className="text-destructive">
          {erro}
        </span>
      )}
    </label>
  );
}
export function LogisticaPedido({
  pedido: pedidoOriginal,
  onChange,
  avisar,
  caixas = CAIXAS_PADRAO,
  jadlogConfigurada = false,
  frenetConfigurada = false,
  gerenciarOrigem = false,
  pedidoId,
  editavel = true,
  usuarioId,
}: {
  pedido: Pedido;
  caixas?: CaixaTipo[];
  onChange: (p: Pedido) => void;
  avisar: (s: string) => void;
  jadlogConfigurada?: boolean;
  frenetConfigurada?: boolean;
  gerenciarOrigem?: boolean;
  pedidoId?: string;
  editavel?: boolean;
  usuarioId: string;
}) {
  const p = normalizarRemessaPrincipal(pedidoOriginal);
  const grupoVolumes = useId();
  const separados = p.itens.filter(ehEnvioSeparado);
  const principal = itensRemessaPrincipal(p.itens).length > 0;
  const [confirmandoOrigem, setConfirmandoOrigem] = useState<string | null>(null);
  const confirmarOrigem = useServerFn(confirmarOrigemFreteMimo);
  const [agora, setAgora] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const expirada = (c: Cotacao) =>
    c.provedor === "frenet" && Number(c.comprovante?.split(".")[0] || 0) <= agora;
  const configurada = frenetConfigurada || jadlogConfigurada;
  const [mov, setMov] = useState({ de: "", para: "", item: "", quantidade: 1 });
  const [cot, setCot] = useState({
    modalidade: "",
    prazo: "",
    modo: "remessa" as "remessa" | "volumes",
    valor: 0,
    valores: {} as Record<string, number>,
  });
  const alterar = (v: Partial<Pedido>) =>
    onChange({
      ...p,
      ...v,
      ...(v.volumes ? { volumes: v.volumes.map((x) => volumeSchema.parse(x)) } : {}),
    });
  const editarVolume = (id: string, v: Partial<Pedido["volumes"][number]>) =>
    alterar({
      volumes: p.volumes.map((x) => (x.id === id ? { ...x, ...v } : x)),
    });
  const prontos =
    principal &&
    p.volumes.length > 0 &&
    conferirDistribuicao(p.itens, p.volumes) &&
    p.volumes.every(
      (v) => v.confirmado && v.conteudo.length && avaliarVolume(v, p.itens).pesoCotacaoG !== null,
    );
  const atual = useRef(p);
  atual.current = p;
  const assinatura = assinaturaFrete(p);
  const estabilizada = useMimoDebounce(assinatura, 800);
  const cotar = useServerFn(cotarFreteMimo);
  const selecionada = p.cotacoes.find(
    (c) => c.id === p.cotacaoId && c.assinatura === assinatura && !expirada(c),
  );
  const consulta = useQuery({
    queryKey: ["mimo-frete", usuarioId, pedidoId, p.leadId, frenetConfigurada, estabilizada],
    queryFn: async () => {
      const pedido = atual.current;
      const resposta = await cotar({ data: { pedido, id: pedidoId } });
      return { ...resposta, selecionadaNoInicio: pedido.cotacaoId };
    },
    enabled:
      principal &&
      configurada &&
      editavel &&
      prontos &&
      !!p.leadId &&
      p.destinoCep.length === 8 &&
      !!p.endereco.trim() &&
      p.declarado > 0 &&
      assinatura === estabilizada &&
      !selecionada &&
      !confirmandoOrigem,
    retry: false,
    staleTime: 14 * 60_000,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    const cotacoes = consulta.data?.cotacoes;
    const pedido = atual.current;
    if (
      !cotacoes?.length ||
      consulta.data?.selecionadaNoInicio !== pedido.cotacaoId ||
      cotacoes[0].assinatura !== assinaturaFrete(pedido) ||
      cotacoes.some((c) => pedido.cotacoes.some((old) => old.id === c.id))
    )
      return;
    const { menor } = compararFretes(cotacoes);
    onChange({
      ...pedido,
      cotacoes: [
        ...pedido.cotacoes
          .filter(
            (c) =>
              !(c.provedor === cotacoes[0].provedor && c.assinatura === cotacoes[0].assinatura),
          )
          .slice(-(30 - cotacoes.length)),
        ...cotacoes,
      ],
      cotacaoId: menor?.id ?? null,
    });
  }, [consulta.data, onChange]);
  async function confirmarCotacao(c: Cotacao, tipo: "postagem" | "coleta", descricao: string) {
    const inicio = atual.current;
    setConfirmandoOrigem(c.id);
    try {
      const { cotacao } = await confirmarOrigem({
        data: { pedido: inicio, id: pedidoId, cotacaoId: c.id, tipo, descricao, confirmado: true },
      });
      const pedido = atual.current;
      if (
        pedido.leadId !== inicio.leadId ||
        pedido.cotacaoId !== inicio.cotacaoId ||
        assinaturaFrete(pedido) !== assinaturaFrete(inicio) ||
        !pedido.cotacoes.some((old) => old.id === c.id)
      )
        throw Error("Os dados do pedido mudaram. Atualize o frete antes de selecionar.");
      onChange({
        ...pedido,
        cotacoes: pedido.cotacoes.map((old) => (old.id === c.id ? cotacao : old)),
        cotacaoId: cotacao.id,
      });
      setAgora(Date.now());
      avisar(
        "Origem confirmada e frete selecionado no pedido em edição. Salve o pedido para registrar.",
      );
    } finally {
      setConfirmandoOrigem(null);
    }
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(
        [
          `Origem: ${p.origemCep}`,
          `Destino: ${p.destinoCep}`,
          `Endereço: ${p.endereco}`,
          `Valor declarado ${p.declaradoProvisorio ? "PROVISÓRIO" : "da nota fiscal"}: ${dinheiro(p.declarado)}`,
          ...separados.map((i) => `Envio separado: ${i.quantidade} × ${i.nome} (${i.unidade})`),
          ...p.volumes.map((v, i) => {
            const a = avaliarVolume(v, p.itens);
            return `Volume ${i + 1}: ${caixaDoVolume(v).dimensoes.join(" × ")} cm, peso ${a.pesoCotacaoG ?? "não informado"} g; ${a.comprovado ? "composição comprovada" : "encaixe não verificado, confirmado manualmente"}`;
          }),
        ].join("\n"),
      );
      avisar("Dados da remessa copiados.");
    } catch {
      avisar("Não foi possível copiar os dados.");
    }
  };
  function registrar() {
    try {
      if (!prontos || !p.destinoCep || !p.endereco.trim())
        throw new Error("Confirme volumes, pesos, CEP e endereço antes da cotação.");
      if (!cot.modalidade.trim() || !cot.prazo.trim())
        throw new Error("Informe modalidade e prazo oficial.");
      const c: Cotacao = {
        id: crypto.randomUUID(),
        modalidade: cot.modalidade,
        prazo: cot.prazo,
        modo: cot.modo,
        valor: cot.valor,
        valoresVolumes: cot.valores,
        oficial: true,
        registradaEm: new Date().toISOString(),
        assinatura: assinaturaFrete(p),
      };
      valorCotacao(c, p.volumes);
      alterar({ cotacoes: [...p.cotacoes, c], cotacaoId: c.id });
      avisar("Cotação manual registrada no pedido em edição.");
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Cotação inválida.");
    }
  }
  const atuais = p.cotacoes.filter((c) => c.assinatura === assinatura && !expirada(c));
  const antigas = p.cotacoes.filter((c) => c.assinatura !== assinatura || expirada(c));
  const comparacao = compararFretes(atuais);
  const menor = comparacao.menor ? valorCotacao(comparacao.menor, p.volumes) : null;
  const caixasAtivas = caixas.filter((caixa) => caixa.ativo);
  const pesoEmGramas = new Intl.NumberFormat("pt-BR", { style: "unit", unit: "gram" });
  const distribuicaoCompleta = conferirDistribuicao(p.itens, p.volumes);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)]">
        <label className="grid gap-1 text-xs">
          CEP de destino
          <Input
            aria-label="CEP de destino"
            value={p.destinoCep}
            maxLength={9}
            placeholder="00000-000"
            onChange={(e) =>
              alterar({
                destinoCep: e.target.value.replace(/\D/g, "").slice(0, 8),
                cotacaoId: null,
              })
            }
          />
        </label>
        <label className="grid min-w-0 gap-1 text-xs">
          Endereço de entrega
          <Input
            aria-label="Endereço de entrega"
            value={p.endereco}
            maxLength={1000}
            onChange={(e) => alterar({ endereco: e.target.value, cotacaoId: null })}
          />
        </label>
      </div>
      {principal && (
        <section
          aria-label="Caixas da remessa"
          className="min-w-0 overflow-hidden rounded-lg border bg-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 sm:px-4">
            <div>
              <h2 className="text-sm font-semibold">Caixas da remessa</h2>
              <p className="text-xs text-muted-foreground">
                {p.volumes.length === 1 ? "1 volume" : `${p.volumes.length} volumes`} ·{" "}
                {prontos ? "Conferidos" : "Confira o peso com a embalagem"}
              </p>
            </div>
            {!prontos && p.volumes.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const conhecidos = p.volumes.every(
                    (v) =>
                      v.conteudo.length &&
                      avaliarVolume(v, p.itens).pesoCotacaoG !== null &&
                      (avaliarVolume(v, p.itens).comprovado || v.confirmado),
                  );
                  if (!conhecidos || !conferirDistribuicao(p.itens, p.volumes)) {
                    avisar("Há caixas ou pesos pendentes. Abra cada volume para conferir.");
                    return;
                  }
                  alterar({
                    volumes: p.volumes.map((v) => ({ ...v, confirmado: true })),
                    cotacaoId: null,
                  });
                }}
              >
                Conferi as caixas e os pesos
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 px-3 py-2 sm:px-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                try {
                  const sugestao = sugerirCaixas(p.itens);
                  if (
                    sugestao.some(
                      (v) =>
                        !caixas.some(
                          (c) => c.ativo && c.id === v.caixa && caixaConfere(c, caixaDoVolume(v)),
                        ),
                    )
                  )
                    throw new Error(
                      "Caixas padrão alteradas ou inativas: use a composição manual.",
                    );
                  alterar({ volumes: sugestao });
                } catch (e) {
                  avisar(e instanceof Error ? e.message : "Não foi possível distribuir.");
                }
              }}
            >
              <Package />
              Sugerir caixas
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                alterar({
                  volumes: [
                    ...p.volumes,
                    {
                      id: crypto.randomUUID(),
                      caixa: "P",
                      conteudo: [],
                      pesoAjustadoG: null,
                      confirmado: false,
                    },
                  ],
                })
              }
            >
              <Plus />
              Adicionar volume
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                alterar({
                  volumes: [
                    {
                      id: crypto.randomUUID(),
                      caixa: "G",
                      conteudo: itensRemessaPrincipal(p.itens).map((i) => ({
                        itemId: i.id,
                        quantidade: i.quantidade,
                      })),
                      pesoAjustadoG: null,
                      confirmado: false,
                    },
                  ],
                })
              }
            >
              Composição manual
            </Button>
          </div>
          {!distribuicaoCompleta && (
            <p role="alert" className="px-3 pb-2 text-xs text-destructive sm:px-4">
              Distribuição incompleta. Confira a quantidade total de cada item.
            </p>
          )}
          <div className="divide-y border-t">
            {p.volumes.map((v, i) => {
              const a = avaliarVolume(v, p.itens);
              const caixa = caixaDoVolume(v);
              const medidas = caixa.dimensoes.join(" × ");
              return (
                <details key={v.id} name={grupoVolumes} className="group/volume">
                  <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2.5 text-sm hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-x-3 sm:px-4 [&::-webkit-details-marker]:hidden">
                    <Package aria-hidden="true" className="size-4 text-muted-foreground" />
                    <span className="min-w-0 break-words">
                      <span className="font-medium">Volume {i + 1}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {caixa.nome} · {medidas} cm
                      </span>
                    </span>
                    <span className="col-start-2 row-start-2 text-xs text-muted-foreground sm:col-start-3 sm:row-start-1 sm:text-right">
                      {a.pesoCotacaoG === null
                        ? "Peso pendente"
                        : pesoEmGramas.format(a.pesoCotacaoG)}
                      {" · "}
                      <span className={v.confirmado ? "text-success" : "text-foreground"}>
                        {v.confirmado ? "Conferido" : "A conferir"}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="col-start-3 row-start-1 size-4 text-muted-foreground group-open/volume:rotate-180 sm:col-start-4"
                    />
                  </summary>
                  <div className="space-y-3 border-t bg-muted/20 px-3 py-3 sm:px-4">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)]">
                      <Escolha
                        label={`Caixa do volume ${i + 1}`}
                        value={v.caixa}
                        opcoes={Object.fromEntries([
                          ...caixasAtivas.map((c) => [
                            c.id,
                            `${c.nome} · ${c.dimensoes.join(" × ")} cm`,
                          ]),
                          [v.caixa, `${caixa.nome} · ${medidas} cm`],
                        ])}
                        onChange={(x) => {
                          const c = caixas.find((c) => c.id === x);
                          if (c)
                            editarVolume(v.id, {
                              caixa: x,
                              tipoCaixa: {
                                nome: c.nome,
                                dimensoes: c.dimensoes,
                                displays: c.displays,
                                misturinhas: c.misturinhas,
                                ...(c.geleias ? { geleias: c.geleias } : {}),
                              },
                              confirmado: false,
                            });
                        }}
                      />
                      <CampoNumero
                        imediato
                        label={`Peso total ajustado ${i + 1} (g)`}
                        valor={v.pesoAjustadoG}
                        onChange={(x) =>
                          editarVolume(v.id, { pesoAjustadoG: x, confirmado: false })
                        }
                      />
                    </div>
                    {v.conteudo.length > 0 && (
                      <details className="rounded-md border bg-card px-3 py-2">
                        <summary className="cursor-pointer text-xs font-medium">
                          Produtos nesta caixa ({v.conteudo.length})
                        </summary>
                        <ul className="mt-2 divide-y text-xs">
                          {v.conteudo.map((c) => (
                            <li key={c.itemId} className="flex justify-between gap-2 py-1.5">
                              <span>{p.itens.find((i) => i.id === c.itemId)?.nome}</span>
                              <strong className="shrink-0 tabular-nums">× {c.quantidade}</strong>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Peso dos produtos:{" "}
                      {a.pesoProdutosG === null
                        ? "não informado"
                        : pesoEmGramas.format(a.pesoProdutosG)}
                    </p>
                    <p className={`text-xs ${a.comprovado ? "text-success" : "text-destructive"}`}>
                      {a.comprovado
                        ? "Composição comprovada"
                        : "Encaixe não verificado — confirmação física necessária"}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={v.confirmado}
                          disabled={!v.conteudo.length || a.pesoCotacaoG === null}
                          onChange={(e) => editarVolume(v.id, { confirmado: e.target.checked })}
                        />
                        Conferi composição, dimensões e peso deste volume
                      </label>
                      {!v.conteudo.length && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remover volume ${i + 1}`}
                          onClick={() =>
                            alterar({ volumes: p.volumes.filter((x) => x.id !== v.id) })
                          }
                        >
                          <Trash2 /> Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
          {p.volumes.length > 1 && (
            <details className="border-t px-3 py-2.5 sm:px-4">
              <summary className="cursor-pointer text-sm font-medium">
                Mover produtos entre volumes
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Escolha
                  label="De"
                  value={mov.de}
                  opcoes={{
                    "": "Escolher",
                    ...Object.fromEntries(p.volumes.map((v, i) => [v.id, `Volume ${i + 1}`])),
                  }}
                  onChange={(de) => setMov({ ...mov, de, item: "" })}
                />
                <Escolha
                  label="Produto a mover"
                  value={mov.item}
                  opcoes={{
                    "": "Escolher",
                    ...Object.fromEntries(
                      (p.volumes.find((v) => v.id === mov.de)?.conteudo ?? []).map((c) => [
                        c.itemId,
                        p.itens.find((i) => i.id === c.itemId)?.nome ?? "Item",
                      ]),
                    ),
                  }}
                  onChange={(item) => setMov({ ...mov, item })}
                />
                <Escolha
                  label="Para"
                  value={mov.para}
                  opcoes={{
                    "": "Escolher",
                    ...Object.fromEntries(
                      p.volumes
                        .filter((v) => v.id !== mov.de)
                        .map((v) => [v.id, `Volume ${p.volumes.indexOf(v) + 1}`]),
                    ),
                  }}
                  onChange={(para) => setMov({ ...mov, para })}
                />
                <CampoNumero
                  imediato
                  label="Quantidade a mover"
                  valor={mov.quantidade}
                  min={1}
                  onChange={(q) => setMov({ ...mov, quantidade: q ?? 1 })}
                />
                <Button
                  className="self-end"
                  variant="outline"
                  onClick={() => {
                    try {
                      alterar({
                        volumes: moverItem(p.volumes, mov.de, mov.para, mov.item, mov.quantidade),
                      });
                    } catch (e) {
                      avisar(e instanceof Error ? e.message : "Movimentação inválida.");
                    }
                  }}
                >
                  <ArrowRight />
                  Mover
                </Button>
              </div>
            </details>
          )}
        </section>
      )}
      {separados.length > 0 && (
        <details className="rounded-lg border px-3 py-2.5 sm:px-4">
          <summary className="cursor-pointer text-sm font-medium">
            Brindes com envio separado ({separados.length})
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Estes brindes ficam fora das caixas e do frete da remessa principal.
          </p>
          <ul className="mt-2 divide-y text-sm">
            {separados.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>{item.nome}</span>{" "}
                <strong className="shrink-0 tabular-nums">× {item.quantidade}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
      {principal ? (
        <>
          <details className="rounded-lg border px-3 py-2.5 sm:px-4">
            <summary className="cursor-pointer text-sm">
              Origem e valor declarado{" "}
              <span className="text-xs text-muted-foreground">
                · {dinheiro(p.declarado)}
                {p.declaradoProvisorio ? " provisório" : ""}
              </span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-xs">
                CEP de origem
                <Input
                  aria-label="CEP de origem"
                  value={p.origemCep}
                  maxLength={8}
                  onChange={(e) => alterar({ origemCep: e.target.value.replace(/\D/g, "") })}
                />
              </label>

              <CampoNumero
                imediato
                label="Valor declarado (R$)"
                moeda
                valor={p.declarado}
                onChange={(v) => alterar({ declarado: v ?? 0 })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={p.declaradoProvisorio}
                  onChange={(e) => alterar({ declaradoProvisorio: e.target.checked })}
                />
                Valor provisório, sem nota fiscal
              </label>
            </div>
          </details>
          <section className="space-y-2 rounded-lg border px-3 py-2.5 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Frete e transportadoras</h2>
              {configurada && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !editavel ||
                    !prontos ||
                    p.origemCep.length !== 8 ||
                    p.destinoCep.length !== 8 ||
                    !p.endereco.trim() ||
                    !p.leadId ||
                    p.declarado <= 0 ||
                    assinatura !== estabilizada ||
                    consulta.isFetching ||
                    !!confirmandoOrigem
                  }
                  onClick={() => void consulta.refetch()}
                >
                  {consulta.isFetching ? "Calculando…" : "Atualizar cotações"}
                </Button>
              )}
            </div>
            {!configurada ? (
              <p role="status" className="text-sm text-muted-foreground">
                O serviço de cotação está temporariamente indisponível. A conexão Frenet precisa ser
                configurada pela gestão.
              </p>
            ) : consulta.isFetching ? (
              <p role="status" className="text-sm">
                {frenetConfigurada
                  ? "Comparando transportadoras na Frenet…"
                  : "Consultando o Jadlog Entregas…"}
              </p>
            ) : consulta.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {consulta.error instanceof Error
                  ? consulta.error.message
                  : "Não foi possível calcular o frete."}
              </p>
            ) : selecionada ? (
              <p role="status" className="text-sm">
                <strong>{dinheiro(valorCotacao(selecionada, p.volumes))}</strong> ·{" "}
                {selecionada.modalidade} · {selecionada.prazo}
              </p>
            ) : atuais.length > 0 ? (
              <p role="status" className="text-sm">
                Cotações recebidas. Confira os preços e prazos abaixo.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Preencha o destino e confira as caixas e seus pesos. As cotações serão consultadas
                automaticamente.
              </p>
            )}
            {frenetConfigurada ? (
              <>
                {atuais.some((c) => c.provedor === "frenet" && !c.postagem) && (
                  <p role="status" className="text-sm text-amber-700">
                    Os preços abaixo já foram recebidos da Frenet. Para liberar a seleção, a gestão
                    precisa registrar no MiMo o ponto de postagem ou a coleta confirmada em Pelotas.
                    {gerenciarOrigem &&
                      " Use Confirmar origem no serviço que você já configurou na Frenet."}
                  </p>
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Sobre a cotação Frenet</summary>
                  <p className="my-2">
                    O valor cobre todas as caixas. O prazo é estimado e segue as regras da
                    transportadora.
                  </p>
                  <a
                    className="text-primary underline"
                    href="https://painel.frenet.com.br/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir Frenet
                  </a>
                </details>
              </>
            ) : (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Sobre a cotação Jadlog</summary>
                <p className="my-2">
                  A consulta usa o simulador público Jadlog Entregas, sem cupons da conta.
                </p>
                <a
                  className="text-primary underline"
                  href="https://www.jadlogentregas.com.br/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir Jadlog Entregas
                </a>
              </details>
            )}
            <ul aria-label="Cotações de frete" className="divide-y divide-border">
              {atuais.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="cotacao"
                      checked={p.cotacaoId === c.id}
                      disabled={!postagemConfirmada(c)}
                      onChange={() => alterar({ cotacaoId: c.id })}
                    />
                    <span>
                      {c.modalidade} · {c.prazo}
                      <small className="block text-muted-foreground">
                        {c.provedor === "frenet"
                          ? "Consulta Frenet"
                          : c.provedor === "jadlog"
                            ? "Consulta Jadlog"
                            : "Registro manual"}{" "}
                        · {new Date(c.registradaEm).toLocaleString("pt-BR")}
                      </small>
                      {c.provedor === "frenet" && (
                        <small className="block text-muted-foreground">
                          {c.postagem
                            ? `${c.postagem.tipo === "coleta" ? "Coleta" : "Postagem"}: ${c.postagem.descricao}`
                            : "Ponto de origem pendente de confirmação"}
                        </small>
                      )}
                    </span>
                  </label>
                  <strong className="text-sm tabular-nums">
                    {dinheiro(valorCotacao(c, p.volumes))}
                  </strong>
                  {postagemConfirmada(c) && valorCotacao(c, p.volumes) === menor && (
                    <span className="text-xs text-success">Menor valor</span>
                  )}
                  {comparacao.maisRapida?.id === c.id && (
                    <span className="text-xs text-primary">Menor prazo</span>
                  )}
                  {gerenciarOrigem && editavel && c.provedor === "frenet" && !c.postagem && (
                    <ConfirmarOrigemCotacao
                      cotacao={c}
                      origemCep={p.origemCep}
                      disabled={!!confirmandoOrigem || consulta.isFetching}
                      confirmar={(tipo, descricao) => confirmarCotacao(c, tipo, descricao)}
                    />
                  )}
                </li>
              ))}
            </ul>
            {antigas.length > 0 && (
              <details className="border-t pt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  Cotações desatualizadas ({antigas.length})
                </summary>
                <ul className="mt-1 divide-y">
                  {antigas.map((c) => (
                    <li key={c.id} className="flex flex-wrap justify-between gap-1 py-1.5">
                      <span>
                        {c.modalidade} · {c.prazo}
                      </span>
                      <time dateTime={c.registradaEm}>
                        {new Date(c.registradaEm).toLocaleString("pt-BR")}
                      </time>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          <details className="space-y-3 rounded-lg border px-3 py-2.5 sm:px-4">
            <summary className="cursor-pointer text-sm">Registrar cotação manual</summary>
            <div className="flex justify-end border-t pt-2">
              <Button size="sm" variant="outline" disabled={!prontos} onClick={() => void copiar()}>
                <Copy />
                Copiar remessa
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-xs">
                Modalidade oficial
                <Input
                  aria-label="Modalidade oficial"
                  value={cot.modalidade}
                  onChange={(e) => setCot({ ...cot, modalidade: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                Prazo informado
                <Input
                  aria-label="Prazo informado"
                  value={cot.prazo}
                  onChange={(e) => setCot({ ...cot, prazo: e.target.value })}
                />
              </label>
              <Escolha
                label="Modo de cotação"
                value={cot.modo}
                opcoes={{
                  remessa: "Total por remessa",
                  volumes: "Individual por volume",
                }}
                onChange={(x) => setCot({ ...cot, modo: x as "remessa" | "volumes" })}
              />
              {cot.modo === "remessa" ? (
                <CampoNumero
                  imediato
                  label="Frete oficialmente cotado (R$)"
                  moeda
                  valor={cot.valor}
                  onChange={(valor) => setCot({ ...cot, valor: valor ?? 0 })}
                />
              ) : (
                p.volumes.map((v, i) => (
                  <CampoNumero
                    imediato
                    key={v.id}
                    label={`Frete volume ${i + 1} (R$)`}
                    moeda
                    valor={cot.valores[v.id] ?? null}
                    onChange={(valor) =>
                      setCot({
                        ...cot,
                        valores: { ...cot.valores, [v.id]: valor ?? 0 },
                      })
                    }
                  />
                ))
              )}
            </div>
            <Button disabled={!prontos} onClick={registrar}>
              <Plus />
              Registrar cotação oficial
            </Button>
          </details>

          <fieldset className="pt-1">
            <legend className="text-sm font-medium">Responsável pelo frete *</legend>
            <div className="flex flex-wrap gap-6 pt-2">
              {(["mimo", "cliente"] as const).map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="frete-pagador"
                    checked={p.fretePagador === v}
                    onChange={() => alterar({ fretePagador: v })}
                  />
                  {v === "mimo" ? "MiMo paga 100%" : "Cliente paga 100%"}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <p
          role="status"
          className="rounded-lg border border-border p-4 text-sm text-muted-foreground"
        >
          Este pedido não tem remessa principal para cotar. Confirme nome, quantidade e endereço dos
          envios separados.
        </p>
      )}
    </div>
  );
}
