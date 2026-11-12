import { CAIXAS_PADRAO, type CaixaTipo } from "@/lib/mimo-tira-regras";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMimoDebounce } from "@/lib/use-mimo-debounce";
import { cotarFreteMimo, confirmarOrigemFreteMimo } from "@/lib/mimo-frete.functions";
import { compararFretes, postagemConfirmada } from "@/lib/mimo-frete";
import { Plus, Package, Trash2, Copy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Escolha } from "@/components/mimo-lead-editor";
import {
  caixaDoVolume,
  avaliarVolume,
  conferirDistribuicao,
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
  pedido: p,
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
  const atuais = p.cotacoes.filter((c) => c.assinatura === assinaturaFrete(p) && !expirada(c));
  const comparacao = compararFretes(atuais);
  const menor = comparacao.menor ? valorCotacao(comparacao.menor, p.volumes) : null;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
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
        <label className="grid gap-1 text-xs sm:col-span-2">
          Endereço de entrega
          <Input
            aria-label="Endereço de entrega"
            value={p.endereco}
            maxLength={1000}
            onChange={(e) => alterar({ endereco: e.target.value, cotacaoId: null })}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-4">
        <div className="text-sm">
          <p>
            {p.volumes.length} caixas calculadas ·{" "}
            {p.declaradoProvisorio ? "Mercadoria (valor provisório)" : "Mercadoria"}{" "}
            {dinheiro(p.declarado)}
          </p>
          <p className="text-xs text-muted-foreground">
            Pesos e medidas vêm dos produtos e caixas cadastrados. Confira o peso total com a
            embalagem antes de cotar.
          </p>
        </div>
        {!prontos && p.volumes.length > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              const conhecidos = p.volumes.every(
                (v) =>
                  v.conteudo.length &&
                  avaliarVolume(v, p.itens).pesoCotacaoG !== null &&
                  (avaliarVolume(v, p.itens).comprovado || v.confirmado),
              );
              if (!conhecidos || !conferirDistribuicao(p.itens, p.volumes)) {
                avisar("Há caixas ou pesos pendentes. Abra os ajustes para conferir.");
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
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Conferir ou ajustar caixas ({p.volumes.length})
        </summary>
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg">Volumes e bonificações</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    const sugestao = sugerirCaixas(p.itens);
                    if (
                      sugestao.some(
                        (v) =>
                          !caixas.some(
                            (c) =>
                              c.ativo &&
                              c.id === v.caixa &&
                              JSON.stringify(c.dimensoes) ===
                                JSON.stringify(caixaDoVolume(v).dimensoes) &&
                              c.displays === caixaDoVolume(v).displays &&
                              c.misturinhas === caixaDoVolume(v).misturinhas,
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
                variant="outline"
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
                Volume
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  alterar({
                    volumes: [
                      {
                        id: crypto.randomUUID(),
                        caixa: "G",
                        conteudo: p.itens.map((i) => ({
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
          </div>
          {!conferirDistribuicao(p.itens, p.volumes) && (
            <p role="alert" className="text-sm text-destructive">
              Distribuição incompleta. Confira a quantidade total de cada item.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {p.volumes.map((v, i) => {
              const a = avaliarVolume(v, p.itens);
              return (
                <article key={v.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <Package className="text-primary" />
                    <h3 className="flex-1">Volume {i + 1}</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover volume ${i + 1}`}
                      disabled={v.conteudo.length > 0}
                      onClick={() => alterar({ volumes: p.volumes.filter((x) => x.id !== v.id) })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Escolha
                      label={`Caixa do volume ${i + 1}`}
                      value={v.caixa}
                      opcoes={Object.fromEntries([
                        ...caixas
                          .filter((c) => c.ativo)
                          .map((c) => [c.id, `${c.nome} · ${c.dimensoes.join(" × ")} cm`]),
                        [
                          v.caixa,
                          `${caixaDoVolume(v).nome} · ${caixaDoVolume(v).dimensoes.join(" × ")} cm`,
                        ],
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
                            },
                            confirmado: false,
                          });
                      }}
                    />
                    <CampoNumero
                      imediato
                      label={`Peso total ajustado ${i + 1} (g)`}
                      valor={v.pesoAjustadoG}
                      onChange={(x) => editarVolume(v.id, { pesoAjustadoG: x, confirmado: false })}
                    />
                  </div>
                  <ul className="mt-4 space-y-2 text-sm">
                    {v.conteudo.map((c) => (
                      <li key={c.itemId} className="flex justify-between gap-3">
                        <span>{p.itens.find((i) => i.id === c.itemId)?.nome}</span>
                        <strong>× {c.quantidade}</strong>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Produtos:{" "}
                    {a.pesoProdutosG === null ? "peso desconhecido" : `${a.pesoProdutosG} g`} ·
                    Remessa:{" "}
                    {a.pesoCotacaoG === null ? "informe peso ajustado" : `${a.pesoCotacaoG} g`}
                  </p>
                  <p
                    className={`mt-2 text-xs ${a.comprovado ? "text-success" : "text-destructive"}`}
                  >
                    {a.comprovado
                      ? "Composição comprovada"
                      : "Encaixe não verificado — confirmação física necessária"}
                  </p>
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={v.confirmado}
                      disabled={!v.conteudo.length || a.pesoCotacaoG === null}
                      onChange={(e) => editarVolume(v.id, { confirmado: e.target.checked })}
                    />
                    Conferi composição, dimensões e peso deste volume
                  </label>
                </article>
              );
            })}
          </div>
          {p.volumes.length > 1 && (
            <div className="border-y border-border py-4">
              <h3 className="mb-3 text-sm">Mover produtos entre volumes</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
            </div>
          )}
        </div>
      </details>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm">Origem e valor da mercadoria</summary>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg">Frete e transportadoras</h2>
          {configurada && (
            <Button
              variant="outline"
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
        <p className="text-sm text-muted-foreground">
          {p.volumes.length} caixas · Origem {p.origemCep} · Destino {p.destinoCep || "a informar"}.
          O comparativo soma o frete de todas as caixas.
        </p>
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
            <p className="text-xs text-muted-foreground">
              Valores calculados pela Frenet conforme os serviços e regras da conta. A seleção
              depende de postagem ou coleta confirmada na origem. O prazo é estimado e começa
              conforme as regras da transportadora.
            </p>
            {atuais.some((c) => c.provedor === "frenet" && !c.postagem) && (
              <p role="status" className="text-sm text-amber-700">
                Os preços abaixo já foram recebidos da Frenet. Para liberar a seleção, a gestão
                precisa registrar no MiMo o ponto de postagem ou a coleta confirmada em Pelotas.
                {gerenciarOrigem &&
                  " Use Confirmar origem no serviço que você já configurou na Frenet."}
              </p>
            )}
            {comparacao.maisRapida && (
              <p className="text-sm">
                Mais rápida: {comparacao.maisRapida.modalidade} · {comparacao.maisRapida.prazo} ·{" "}
                {dinheiro(valorCotacao(comparacao.maisRapida, p.volumes))}
              </p>
            )}
            <a
              className="text-sm text-primary underline"
              href="https://painel.frenet.com.br/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir Frenet
            </a>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              A multicotação Frenet aguarda configuração. A consulta disponível usa o simulador
              público Jadlog Entregas, sem cupons da conta.
            </p>
            <a
              className="text-sm text-primary underline"
              href="https://www.jadlogentregas.com.br/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir Jadlog Entregas
            </a>
          </>
        )}
        <ul aria-label="Cotações de frete" className="divide-y divide-border">
          {p.cotacoes.map((c) => {
            const atual = c.assinatura === assinaturaFrete(p) && !expirada(c);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cotacao"
                    checked={p.cotacaoId === c.id}
                    disabled={!atual || !postagemConfirmada(c)}
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
                <strong>{atual ? dinheiro(valorCotacao(c, p.volumes)) : "Desatualizada"}</strong>
                {atual && postagemConfirmada(c) && valorCotacao(c, p.volumes) === menor && (
                  <span className="text-xs text-success">Menor valor</span>
                )}
                {atual && comparacao.maisRapida?.id === c.id && (
                  <span className="text-xs text-primary">Menor prazo</span>
                )}
                {gerenciarOrigem && editavel && atual && c.provedor === "frenet" && !c.postagem && (
                  <ConfirmarOrigemCotacao
                    cotacao={c}
                    origemCep={p.origemCep}
                    disabled={!!confirmandoOrigem || consulta.isFetching}
                    confirmar={(tipo, descricao) => confirmarCotacao(c, tipo, descricao)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm">
          Registrar uma cotação obtida fora da ferramenta
        </summary>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <h2 className="text-lg">Cotação manual</h2>
          <Button variant="outline" disabled={!prontos} onClick={() => void copiar()}>
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

      <fieldset className="border-t border-border pt-4">
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
    </div>
  );
}
