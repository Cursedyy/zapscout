import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dinheiro, STATUS, type PedidoSalvo } from "@/lib/mimo-pedido";
import { alterarStatusPedidoMimo, listarPedidosMimo } from "@/lib/mimo-pedido.functions";
import { tiraOptions } from "@/lib/mimo-tira.queries";
import {
  erroTransicao,
  filtroPedidosSchema,
  opcoesStatus,
  totalPaginas,
} from "@/lib/mimo-tira-regras";
import { ORIGENS } from "@/lib/mimo-leads";
import { MimoVendasVendedor } from "@/components/mimo-vendas-vendedor";
import { PAPEIS_VENDAS_VENDEDOR } from "@/lib/mimo-vendas-vendedor.functions";

const filtroInicial = filtroPedidosSchema.parse({
  pagina: 1,
  porPagina: 10,
  ordem: "atualizado_desc",
  incluirContexto: true,
});
const dataAtualizacao = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
const dataFaturamento = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" });

export function MimoPainelPedidos({ integrado = false }: { integrado?: boolean }) {
  const [filtro, setFiltro] = useState(filtroInicial);
  const [rascunhoFiltro, setRascunhoFiltro] = useState(filtroInicial);
  const [erroFiltro, setErroFiltro] = useState("");
  const client = useQueryClient();
  const listar = useServerFn(listarPedidosMimo);
  const alterarStatus = useServerFn(alterarStatusPedidoMimo);
  const contexto = useQuery(tiraOptions);
  const tira = contexto.data;
  const podeFaturar =
    !contexto.isError &&
    !!tira?.disponivel &&
    opcoesStatus(tira.papel, "confirmado").includes("faturado");
  const pedidos = useQuery({
    queryKey: ["mimo-painel-pedidos", tira?.empresaId, tira?.usuarioId, tira?.papel, filtro],
    queryFn: () => listar({ data: filtro }),
    enabled: !!tira && !contexto.isError,
  });
  const [selecionado, setSelecionado] = useState<PedidoSalvo | null>(null);
  const paginas = totalPaginas(pedidos.data?.total ?? 0, filtro.porPagina);
  useEffect(() => {
    if (pedidos.data && !pedidos.isError && filtro.pagina > paginas)
      setFiltro((atual) => ({ ...atual, pagina: paginas }));
  }, [pedidos.data, pedidos.isError, filtro.pagina, paginas]);
  const [data, setData] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const tituloLista = useRef<HTMLHeadingElement>(null);
  const botaoOrigem = useRef<HTMLButtonElement>(null);
  const TituloPainel = integrado ? "h2" : "h1";
  const TituloLista = integrado ? "h3" : "h2";
  const atual = pedidos.data?.itens.find((pedido) => pedido.id === selecionado?.id);
  const validacao = !selecionado
    ? null
    : !podeFaturar || !tira || tira.empresaId !== selecionado.empresa_id
      ? "Faturamento indisponível."
      : atual?.versao !== selecionado.versao
        ? "O pedido mudou. Feche e reabra o faturamento."
        : erroTransicao(
            tira.papel,
            selecionado.status,
            "faturado",
            {
              ...selecionado.documento,
              pagamento: { ...selecionado.documento.pagamento, faturadoEm: data },
            },
            selecionado.pix,
          );

  async function faturar() {
    if (!selecionado || validacao || ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      await alterarStatus({
        data: {
          id: selecionado.id,
          versao: selecionado.versao,
          status: "faturado",
          motivo: null,
          faturadoEm: data,
        },
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["mimo-painel-pedidos"] }),
        client.invalidateQueries({ queryKey: ["mimo-tira-lista"] }),
      ]);
      setSucesso(`Pedido #${selecionado.numero} faturado.`);
      setSelecionado(null);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível faturar o pedido.");
      void pedidos.refetch();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <TituloPainel className={integrado ? "text-2xl" : "text-3xl"}>
          Painel de pedidos
        </TituloPainel>
        <Button asChild>
          <Link to="/mimo/tira-pedido" search={{}}>
            <ClipboardList /> Abrir Tira-pedido
          </Link>
        </Button>
      </header>
      <p className="mt-2 text-sm text-muted-foreground">
        Pedidos registrados no Tira-pedido MiMo, conforme seu acesso. O período considera a data de
        criação. Esta lista não sincroniza pedidos externos do OMIE.
      </p>
      {!!tira && (PAPEIS_VENDAS_VENDEDOR as readonly string[]).includes(tira.papel) && <MimoVendasVendedor />}

      <form
        aria-label="Filtros dos pedidos"
        className="mt-5 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const resultado = filtroPedidosSchema.safeParse({ ...rascunhoFiltro, pagina: 1 });
          if (!resultado.success) {
            setErroFiltro(resultado.error.issues[0]?.message ?? "Confira os filtros.");
            return;
          }
          setErroFiltro("");
          setFiltro(resultado.data);
        }}
      >
        <label className="grid gap-1 text-sm">
          Cliente ou número
          <Input
            maxLength={100}
            value={rascunhoFiltro.busca}
            onChange={(e) => setRascunhoFiltro({ ...rascunhoFiltro, busca: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select
            className="h-10 rounded-md border bg-background px-3"
            value={rascunhoFiltro.status ?? ""}
            onChange={(e) =>
              setRascunhoFiltro({
                ...rascunhoFiltro,
                status: e.target.value ? (e.target.value as keyof typeof STATUS) : null,
              })
            }
          >
            <option value="">Todos</option>
            {Object.entries(STATUS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Criados de
          <Input
            type="date"
            value={rascunhoFiltro.inicio ?? ""}
            onChange={(e) =>
              setRascunhoFiltro({ ...rascunhoFiltro, inicio: e.target.value || null })
            }
          />
        </label>
        <label className="grid gap-1 text-sm">
          Criados até
          <Input
            type="date"
            value={rascunhoFiltro.fim ?? ""}
            onChange={(e) => setRascunhoFiltro({ ...rascunhoFiltro, fim: e.target.value || null })}
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Aplicar filtros</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFiltro(filtroInicial);
              setRascunhoFiltro(filtroInicial);
              setErroFiltro("");
            }}
          >
            Limpar filtros
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={contexto.isFetching || pedidos.isFetching}
            onClick={() => void (contexto.isError ? contexto.refetch() : pedidos.refetch())}
          >
            Atualizar pedidos
          </Button>
        </div>
        {erroFiltro && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-4">
            {erroFiltro}
          </p>
        )}
      </form>

      <section aria-labelledby="mimo-pedidos-recentes" className="mt-6">
        <TituloLista
          ref={tituloLista}
          tabIndex={-1}
          id="mimo-pedidos-recentes"
          className="mb-3 text-lg font-semibold"
        >
          Pedidos encontrados
        </TituloLista>
        {pedidos.isFetching && !pedidos.isPending && (
          <p role="status" className="mb-3 text-sm text-muted-foreground">
            Atualizando pedidos…
          </p>
        )}
        {sucesso && (
          <p role="status" className="mb-3 text-sm">
            {sucesso}
          </p>
        )}
        {contexto.isError ? (
          <div role="alert" className="text-sm">
            Não foi possível carregar o painel.{" "}
            <Button variant="link" onClick={() => void contexto.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : pedidos.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando pedidos…
          </p>
        ) : pedidos.isError ? (
          <div role="alert" className="text-sm">
            Não foi possível carregar os pedidos.{" "}
            <Button variant="link" onClick={() => void pedidos.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : !pedidos.data.disponivel ? (
          <p role="status" className="text-sm text-muted-foreground">
            A listagem de pedidos está indisponível no momento.
          </p>
        ) : pedidos.data.itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido encontrado.</p>
        ) : (
          <Table aria-labelledby="mimo-pedidos-recentes">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Número</TableHead>
                <TableHead scope="col">Cliente</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" className="text-right">
                  Total
                </TableHead>
                <TableHead scope="col">Criado em</TableHead>
                <TableHead scope="col">Atualizado em</TableHead>
                <TableHead scope="col">Origem do lead</TableHead>
                <TableHead scope="col">Responsável do pedido</TableHead>
                {podeFaturar && (
                  <TableHead scope="col" className="sticky right-0 bg-background">
                    Ação
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pedidos.data.itens.map((pedido) => (
                <TableRow key={pedido.id}>
                  <TableCell>
                    <Button asChild variant="link" className="h-auto p-0">
                      <Link
                        to="/mimo/tira-pedido"
                        search={{ busca: String(pedido.numero) }}
                        aria-label={`Abrir pedido ${pedido.numero}`}
                      >
                        #{pedido.numero}
                      </Link>
                    </Button>
                  </TableCell>
                  <TableCell className="min-w-32 wrap-anywhere">
                    {pedido.documento.cliente}
                  </TableCell>
                  <TableCell>{STATUS[pedido.status]}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {dinheiro(pedido.total)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <time dateTime={pedido.created_at}>
                      {dataAtualizacao.format(new Date(pedido.created_at))}
                    </time>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <time dateTime={pedido.updated_at}>
                      {dataAtualizacao.format(new Date(pedido.updated_at))}
                    </time>
                  </TableCell>
                  <TableCell>
                    {ORIGENS[
                      pedidos.data.contextoPedidos?.[pedido.id]?.origemLead as keyof typeof ORIGENS
                    ] ?? "Não informada"}
                  </TableCell>
                  <TableCell>
                    {pedidos.data.contextoPedidos?.[pedido.id]?.responsavelNome ??
                      (pedido.documento.responsavelId === tira?.usuarioId
                        ? "Você"
                        : pedido.documento.responsavelId
                          ? "Responsável não disponível"
                          : "Sem responsável")}
                  </TableCell>
                  {podeFaturar && (
                    <TableCell className="sticky right-0 bg-background">
                      {pedido.status === "confirmado" && pedido.empresa_id === tira?.empresaId && (
                        <Button
                          aria-label={`Faturar pedido ${pedido.numero}`}
                          aria-haspopup="dialog"
                          onClick={(event) => {
                            botaoOrigem.current = event.currentTarget;
                            setData(dataFaturamento.format(new Date()));
                            setErro("");
                            setSucesso("");
                            setSelecionado(pedido);
                          }}
                        >
                          <ReceiptText aria-hidden="true" /> Faturar
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {pedidos.data?.disponivel && !pedidos.isError && (
          <nav
            aria-label="Paginação dos pedidos"
            className="mt-4 flex flex-wrap items-center gap-3"
          >
            <Button
              variant="outline"
              disabled={pedidos.isFetching || filtro.pagina <= 1}
              onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina - 1 })}
            >
              Anterior
            </Button>
            <span className="text-sm">
              Página {Math.min(filtro.pagina, paginas)} de {paginas} · {pedidos.data.total} pedidos
            </span>
            <Button
              variant="outline"
              disabled={pedidos.isFetching || filtro.pagina >= paginas}
              onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina + 1 })}
            >
              Próxima
            </Button>
          </nav>
        )}
      </section>
      <Dialog
        open={!!selecionado}
        onOpenChange={(aberto) => {
          if (!aberto && !ocupado) setSelecionado(null);
        }}
      >
        <DialogContent
          className="mimo-tira max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (botaoOrigem.current?.isConnected ? botaoOrigem.current : tituloLista.current)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Faturar pedido #{selecionado?.numero}</DialogTitle>
            <DialogDescription>
              Confirme a data de faturamento. O histórico do pedido será preservado.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void faturar();
            }}
          >
            <label className="grid gap-2 text-sm">
              Data de faturamento
              <Input
                type="date"
                value={data}
                required
                disabled={ocupado}
                onChange={(event) => {
                  setData(event.target.value);
                  setErro("");
                }}
              />
            </label>
            {(erro || validacao) && (
              <p role="alert" className="text-sm text-destructive">
                {erro || validacao}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={ocupado}
                onClick={() => setSelecionado(null)}
              >
                Voltar
              </Button>
              <Button type="submit" disabled={!selecionado || !!validacao || ocupado}>
                {ocupado ? "Faturando…" : "Confirmar faturamento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
