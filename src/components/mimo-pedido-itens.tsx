import { useRef, useState } from "react";
import { Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Escolha } from "@/components/mimo-lead-editor";
import { CampoNumero } from "@/components/mimo-pedido-logistica";
import { descontar, dinheiro, type ItemPedido, type Produto } from "@/lib/mimo-pedido";

type Linha = { chave: string; produto?: Produto; item?: ItemPedido };

function linhasDoPedido(catalogo: Produto[], itens: ItemPedido[], editavel: boolean): Linha[] {
  const primeirasPorCodigo = new Map<string, ItemPedido>();
  for (const item of itens) {
    if (!item.brinde && !primeirasPorCodigo.has(item.codigo))
      primeirasPorCodigo.set(item.codigo, item);
  }
  const doCatalogo = editavel
    ? catalogo
        .filter((produto) => produto.ativo)
        .map((produto) => ({
          chave: `catalogo:${produto.codigo}`,
          produto,
          item: primeirasPorCodigo.get(produto.codigo),
        }))
    : [];
  const incluidos = new Set(doCatalogo.map(({ item }) => item?.id));
  return [
    ...doCatalogo,
    ...itens.filter(({ id }) => !incluidos.has(id)).map((item) => ({ chave: item.id, item })),
  ];
}

function totalDaLinha(item?: ItemPedido): string {
  if (!item) return "—";
  if (item.brinde) return dinheiro(0);
  try {
    return dinheiro(descontar(item.precoNegociado * item.quantidade, item.desconto));
  } catch {
    return "—";
  }
}

function precoPorUnidade(preco: number | null | undefined, unidade?: string): string {
  if (preco == null) return "—";
  const embalagem = unidade?.trim().toLowerCase();
  if (embalagem === "unidade") return dinheiro(preco);
  const unidades = Number(embalagem?.match(/^display de ([1-9]\d{0,3})$/)?.[1]);
  return unidades ? dinheiro(Math.round(preco / unidades)) : "—";
}

function QuantidadeNaTabela({
  nome,
  atual,
  desabilitada,
  alterar,
}: {
  nome: string;
  atual?: number;
  desabilitada: boolean;
  alterar: (valor: number) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const valor = texto ?? (atual === undefined ? "" : String(atual));
  return (
    <Input
      aria-label={`Quantidade de ${nome}`}
      aria-invalid={Number(valor) > 1000}
      className="mx-auto h-9 min-w-0 max-w-14 border-amber-200 bg-white px-1 text-center text-xs font-medium tabular-nums text-slate-950 sm:h-8 sm:text-sm"
      disabled={desabilitada}
      inputMode="numeric"
      maxLength={4}
      placeholder="—"
      title="Até 1000 por linha. Digite 0 para remover."
      value={valor}
      onChange={(e) => {
        const entrada = e.target.value;
        if (!/^\d{0,4}$/.test(entrada)) return;
        setTexto(entrada);
        const quantidade = Number(entrada);
        if (quantidade > 0 && quantidade <= 1000 && quantidade !== atual) alterar(quantidade);
      }}
      onBlur={() => {
        if (texto !== null && /^0+$/.test(texto) && atual !== undefined) alterar(0);
        setTexto(null);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        e.currentTarget.blur();
      }}
    />
  );
}

export function TabelaProdutosPedido({
  catalogo,
  itens,
  totalProdutos,
  editavel,
  podeVerCustoBrinde,
  onAlterarItens,
  onAdicionarProduto,
}: {
  catalogo: Produto[];
  itens: ItemPedido[];
  totalProdutos: number | null;
  editavel: boolean;
  podeVerCustoBrinde: boolean;
  onAlterarItens: (itens: ItemPedido[]) => void;
  onAdicionarProduto: (codigo: string, quantidade: number) => void;
}) {
  const [busca, setBusca] = useState("");
  const [ajusteId, setAjusteId] = useState<string | null>(null);
  const botaoAjustes = useRef<HTMLButtonElement | null>(null);
  const normalizar = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const buscaNormalizada = normalizar(busca.trim());
  const linhas = linhasDoPedido(catalogo, itens, editavel).filter(({ produto, item }) =>
    normalizar(`${item?.codigo ?? produto?.codigo} ${item?.nome ?? produto?.nome}`).includes(
      buscaNormalizada,
    ),
  );
  const quantidadeTotal = itens.reduce((soma, item) => soma + item.quantidade, 0);
  const catalogoPorCodigo = new Map(catalogo.map((produto) => [produto.codigo, produto]));
  const ajuste = itens.find((item) => item.id === ajusteId);
  const alterarItem = (id: string, valores: Partial<ItemPedido>) =>
    onAlterarItens(itens.map((item) => (item.id === id ? { ...item, ...valores } : item)));
  const remover = (id: string) => onAlterarItens(itens.filter((item) => item.id !== id));

  return (
    <section
      className="overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-950 shadow-sm"
      aria-label="Produtos do pedido"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-3 py-3 text-white sm:px-4">
        <h2 className="text-sm font-semibold !text-white sm:text-base">Produtos do pedido</h2>
        {(editavel || itens.length > 0) && (
          <div className="relative w-full sm:w-60">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-500"
            />
            <Input
              aria-label="Buscar produto por código ou nome"
              className="h-9 border-slate-300 bg-white pl-8 text-sm text-slate-950 placeholder:text-slate-500"
              placeholder="Buscar por código ou nome"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        )}
      </header>
      <div className="max-h-[min(62dvh,36rem)] overflow-auto">
        <table
          aria-label="Itens do pedido"
          className="w-full table-fixed border-separate border-spacing-0 text-left text-xs sm:text-sm"
        >
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800">
            <tr>
              <th
                scope="col"
                className="hidden w-20 border-b border-slate-300 px-3 py-2 sm:table-cell"
              >
                Código
              </th>
              <th scope="col" className="hidden w-24 border-b border-slate-300 px-2 py-2 text-right lg:table-cell">
                Valor unit.
              </th>
              <th scope="col" className="border-b border-slate-300 px-2 py-2 sm:px-3">
                Produto
              </th>
              <th scope="col" className="hidden w-12 border-b border-slate-300 px-1 py-2 text-center lg:table-cell" title="Embalagens por caixa P">
                Cx P
              </th>
              <th scope="col" className="hidden w-12 border-b border-slate-300 px-1 py-2 text-center lg:table-cell" title="Embalagens por caixa G">
                Cx G
              </th>
              <th
                scope="col"
                className="w-[4.1rem] border-b border-slate-300 px-1 py-2 text-right sm:w-24 sm:px-3"
              >
                Preço
              </th>
              <th
                scope="col"
                className="w-12 border-b border-slate-300 bg-amber-100 px-1 py-2 text-center sm:w-[5.5rem]"
              >
                Qtd.<span className="sr-only sm:not-sr-only"> pedido</span>
              </th>
              <th
                scope="col"
                className="w-[4.4rem] border-b border-slate-300 px-2 py-2 text-right sm:w-28 sm:px-3"
              >
                Total fábrica
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ chave, produto, item }) => {
              const codigo = item?.codigo ?? produto?.codigo ?? "";
              const nome = item?.nome ?? produto?.nome ?? "";
              const unidade = item?.unidade ?? produto?.unidade;
              const preco = item ? (item.brinde ? 0 : item.precoNegociado) : produto?.preco;
              const cadastro = produto ?? catalogoPorCodigo.get(codigo);
              const valorUnitario = precoPorUnidade(preco, unidade);
              const caixaP = cadastro?.caixaP ?? "—";
              const caixaG = cadastro?.caixaG ?? "—";
              const podeEditarLinha =
                editavel &&
                (!!item || (produto?.preco != null && produto.pesoG != null && !!produto.unidade));
              return (
                <tr key={chave} className="group hover:bg-slate-50">
                  <td className="hidden border-b border-slate-100 px-3 py-1 font-medium tabular-nums text-slate-600 sm:table-cell">
                    {codigo || "—"}
                  </td>
                  <td className="hidden border-b border-slate-100 px-2 py-1 text-right tabular-nums text-emerald-800 lg:table-cell">
                    {valorUnitario}
                  </td>
                  <th
                    scope="row"
                    className="border-b border-slate-100 px-2 py-1 font-medium sm:px-3"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="min-w-0 break-words">
                        {nome}
                        <span className="block text-[10px] font-normal text-slate-600 sm:text-xs">
                          <span className="sm:hidden">{codigo && `${codigo} · `}</span>
                          {item?.brinde ? "Brinde" : unidade || ""}
                        </span>
                        <span className="block text-[10px] font-normal tabular-nums text-slate-600 lg:hidden">
                          Un. {valorUnitario} · Cx P {caixaP} · Cx G {caixaG}
                        </span>
                      </div>
                      {item && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-slate-600 hover:text-slate-950"
                          aria-label={`${editavel ? "Ajustar" : "Ver detalhes de"} ${nome}`}
                          title={editavel ? "Ajustar item" : "Ver detalhes"}
                          onClick={(e) => {
                            botaoAjustes.current = e.currentTarget;
                            setAjusteId(item.id);
                          }}
                        >
                          <SlidersHorizontal />
                        </Button>
                      )}
                    </div>
                  </th>
                  <td className="hidden border-b border-slate-100 px-1 py-1 text-center tabular-nums lg:table-cell">{caixaP}</td>
                  <td className="hidden border-b border-slate-100 px-1 py-1 text-center tabular-nums lg:table-cell">{caixaG}</td>
                  <td className="border-b border-slate-100 px-1 py-1 text-right tabular-nums text-emerald-800 [overflow-wrap:anywhere] sm:px-2">
                    {preco == null ? "—" : dinheiro(preco)}
                  </td>
                  <td className="border-b border-amber-100 bg-amber-50 px-1 py-1 text-center tabular-nums">
                    {editavel ? (
                      <QuantidadeNaTabela
                        nome={codigo ? `${codigo} — ${nome}` : nome}
                        atual={item?.quantidade}
                        desabilitada={!podeEditarLinha}
                        alterar={(quantidade) => {
                          if (item && quantidade === 0) remover(item.id);
                          else if (item) alterarItem(item.id, { quantidade });
                          else if (produto && quantidade > 0)
                            onAdicionarProduto(produto.codigo, quantidade);
                        }}
                      />
                    ) : (
                      item?.quantidade
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-1 py-1 text-right font-medium tabular-nums [overflow-wrap:anywhere] sm:px-2">
                    {totalDaLinha(item)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!linhas.length && (
          <p className="px-4 py-5 text-sm text-slate-600">
            {buscaNormalizada ? "Nenhum produto encontrado." : "Nenhum produto no pedido."}
          </p>
        )}
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-300 bg-slate-100 px-3 py-3 text-slate-950 sm:px-4"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="text-xs tabular-nums sm:text-sm">
          Qtd. total <strong>{quantidadeTotal}</strong>
        </span>
        <span className="flex flex-wrap items-baseline gap-x-2 text-xs font-medium sm:text-sm">
          Total fábrica{" "}
          <strong className="text-lg tabular-nums">
            {totalProdutos === null ? "Valor inválido" : dinheiro(totalProdutos)}
          </strong>
        </span>
      </div>
      <Dialog
        open={!!ajuste}
        onOpenChange={(aberto) => {
          if (!aberto) setAjusteId(null);
        }}
      >
        {ajuste && (
          <DialogContent
            className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
            onCloseAutoFocus={(e) => {
              if (!botaoAjustes.current?.isConnected) return;
              e.preventDefault();
              botaoAjustes.current.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editavel ? "Ajustar item" : "Detalhes do item"}</DialogTitle>
              <DialogDescription>
                {ajuste.nome} · {ajuste.unidade}
              </DialogDescription>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Preço original {dinheiro(ajuste.precoOriginal)}
            </p>
            <fieldset disabled={!editavel}>
              {ajuste.brinde ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {podeVerCustoBrinde && (
                    <CampoNumero
                      imediato
                      label="Custo interno do brinde (R$)"
                      moeda
                      valor={ajuste.custoInterno}
                      onChange={(valor) => alterarItem(ajuste.id, { custoInterno: valor })}
                    />
                  )}
                  <CampoNumero
                    imediato
                    label="Peso unitário do brinde (g)"
                    valor={ajuste.pesoG}
                    onChange={(valor) => alterarItem(ajuste.id, { pesoG: valor })}
                  />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <CampoNumero
                      imediato
                      label="Preço negociado (R$)"
                      moeda
                      valor={ajuste.precoNegociado}
                      onChange={(valor) => alterarItem(ajuste.id, { precoNegociado: valor ?? 0 })}
                    />
                  </div>
                  <Escolha
                    label="Tipo de desconto"
                    value={ajuste.desconto.modo}
                    opcoes={{ percentual: "Percentual", fixo: "Valor fixo" }}
                    onChange={(modo) =>
                      alterarItem(ajuste.id, {
                        desconto: { modo: modo === "fixo" ? "fixo" : "percentual", valor: 0 },
                      })
                    }
                  />
                  <CampoNumero
                    imediato
                    label={`Desconto (${ajuste.desconto.modo === "fixo" ? "R$" : "%"})`}
                    moeda
                    valor={ajuste.desconto.valor}
                    onChange={(valor) =>
                      alterarItem(ajuste.id, {
                        desconto: { ...ajuste.desconto, valor: valor ?? 0 },
                      })
                    }
                  />
                </div>
              )}
            </fieldset>
            <div className="flex flex-wrap justify-end gap-2">
              {editavel && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto text-destructive"
                  onClick={() => {
                    remover(ajuste.id);
                    setAjusteId(null);
                  }}
                >
                  <Trash2 />
                  Remover item
                </Button>
              )}
              <Button type="button" onClick={() => setAjusteId(null)}>
                {editavel ? "Concluir ajustes" : "Fechar"}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
