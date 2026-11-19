import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dinheiro, STATUS } from "@/lib/mimo-pedido";
import { listarPedidosMimo } from "@/lib/mimo-pedido.functions";
import { filtroPedidosSchema } from "@/lib/mimo-tira-regras";

const filtro = filtroPedidosSchema.parse({ pagina: 1, porPagina: 10, ordem: "atualizado_desc" });
const dataAtualizacao = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

export function MimoPainelPedidos() {
  const listar = useServerFn(listarPedidosMimo);
  const pedidos = useQuery({
    queryKey: ["mimo-painel-pedidos", filtro],
    queryFn: () => listar({ data: filtro }),
  });

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl">Painel de pedidos</h1>
        <Button asChild>
          <Link to="/mimo/tira-pedido" search={{}}><ClipboardList /> Abrir Tira-pedido</Link>
        </Button>
      </header>

      <section aria-labelledby="mimo-pedidos-recentes" className="mt-6">
        <h2 id="mimo-pedidos-recentes" className="mb-3 text-lg font-semibold">10 pedidos mais recentes</h2>
        {pedidos.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">Carregando pedidos…</p>
        ) : pedidos.isError ? (
          <div role="alert" className="text-sm">
            Não foi possível carregar os pedidos. <Button variant="link" onClick={() => void pedidos.refetch()}>Tentar novamente</Button>
          </div>
        ) : !pedidos.data.disponivel ? (
          <p role="status" className="text-sm text-muted-foreground">A listagem de pedidos está indisponível no momento.</p>
        ) : pedidos.data.itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido encontrado.</p>
        ) : (
          <Table aria-labelledby="mimo-pedidos-recentes">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Número</TableHead>
                <TableHead scope="col">Cliente</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" className="text-right">Total</TableHead>
                <TableHead scope="col">Atualizado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pedidos.data.itens.map((pedido) => (
                <TableRow key={pedido.id}>
                  <TableCell>
                    <Button asChild variant="link" className="h-auto p-0">
                      <Link to="/mimo/tira-pedido" search={{ busca: String(pedido.numero) }} aria-label={`Abrir pedido ${pedido.numero}`}>
                        #{pedido.numero}
                      </Link>
                    </Button>
                  </TableCell>
                  <TableCell className="min-w-32 wrap-anywhere">{pedido.documento.cliente}</TableCell>
                  <TableCell>{STATUS[pedido.status]}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{dinheiro(pedido.total)}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <time dateTime={pedido.updated_at}>{dataAtualizacao.format(new Date(pedido.updated_at))}</time>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </section>
  );
}