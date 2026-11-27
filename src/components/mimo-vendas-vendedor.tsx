import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dinheiro } from "@/lib/mimo-pedido";
import { vendasPorVendedorMimo } from "@/lib/mimo-vendas-vendedor.functions";

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Sales per seller (including admins/managers who own orders) for management and billing. */
export function MimoVendasVendedor() {
  const fn = useServerFn(vendasPorVendedorMimo);
  const [inicio, setInicio] = useState(() => `${hoje().slice(0, 8)}01`);
  const [fim, setFim] = useState(hoje);
  const valido = !!inicio && !!fim && inicio <= fim;
  const q = useQuery({
    queryKey: ["mimo-vendas-vendedor", inicio, fim],
    queryFn: () => fn({ data: { inicio, fim } }),
    enabled: valido,
    placeholderData: keepPreviousData,
  });
  const linhas = q.data?.linhas ?? [];
  const soma = linhas.reduce(
    (s, l) => ({ pedidos: s.pedidos + l.pedidos, valor: s.valor + l.valor, faturado: s.faturado + l.faturado }),
    { pedidos: 0, valor: 0, faturado: 0 },
  );
  return (
    <section aria-label="Vendas por vendedor" className="mt-6 rounded-lg border border-border bg-card p-4 md:p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="size-4" />
            Vendas por vendedor
          </h2>
          <p className="text-xs text-muted-foreground">
            Pedidos do Tira-pedido criados no período, por responsável. Rascunhos e cancelados não contam como venda;
            faturado inclui enviados e entregues.
          </p>
        </div>
        <div className="flex gap-2">
          <label className="grid gap-1 text-xs">
            De
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs">
            Até
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </label>
        </div>
      </header>
      {!valido ? (
        <p className="mt-3 text-sm" role="alert">Escolha um período válido.</p>
      ) : q.isError ? (
        <p className="mt-3 text-sm" role="alert">Não foi possível carregar as vendas por vendedor.</p>
      ) : q.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">Carregando…</p>
      ) : !linhas.length ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum pedido no período.</p>
      ) : (
        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">Valor vendido</TableHead>
              <TableHead className="text-right">Faturado</TableHead>
              <TableHead className="text-right">Ticket médio</TableHead>
              <TableHead className="text-right">Cancelados</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.responsavelId ?? "sem"}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell className="text-right">{l.pedidos}</TableCell>
                <TableCell className="text-right">{dinheiro(l.valor)}</TableCell>
                <TableCell className="text-right">{dinheiro(l.faturado)}</TableCell>
                <TableCell className="text-right">{l.pedidos ? dinheiro(Math.round(l.valor / l.pedidos)) : "—"}</TableCell>
                <TableCell className="text-right">{l.cancelados}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{soma.pedidos}</TableCell>
              <TableCell className="text-right">{dinheiro(soma.valor)}</TableCell>
              <TableCell className="text-right">{dinheiro(soma.faturado)}</TableCell>
              <TableCell className="text-right">{soma.pedidos ? dinheiro(Math.round(soma.valor / soma.pedidos)) : "—"}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </section>
  );
}
