import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { consultarInadimplenciaMimo } from "@/lib/mimo-inadimplencia.functions";
import {
  csvInadimplencia,
  dataBrIso,
  nomeCliente,
  nomeVendedor,
  percentualBr,
  periodoInadimplenciaSchema,
  periodoPadrao,
  reais,
  type PeriodoInadimplencia,
  type ResultadoInadimplencia,
} from "@/lib/mimo-inadimplencia";

const MAX_CLIENTES_TELA = 30;

function baixarCsv(resultado: ResultadoInadimplencia) {
  const blob = new Blob([csvInadimplencia(resultado)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inadimplencia-mimo-${resultado.periodo.de}-a-${resultado.periodo.ate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
    </div>
  );
}

const titulos = (n: number) => `${n.toLocaleString("pt-BR")} título${n === 1 ? "" : "s"}`;

function Painel({ r }: { r: ResultadoInadimplencia }) {
  const semBase = r.baseVencida.quantidade === 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Vencimentos de {dataBrIso(r.periodo.de)} a {dataBrIso(r.periodo.ate)} · posição em{" "}
          {dataBrIso(r.hoje)} · {titulos(r.titulosLidos)} lidos no Omie
        </p>
        <Button variant="outline" onClick={() => baixarCsv(r)}>
          <Download /> Exportar CSV
        </Button>
      </div>
      {r.avisos.length > 0 && (
        <ul role="status" className="space-y-1 rounded-lg border border-amber-500/40 p-3 text-sm">
          {r.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {r.total.quantidade === 0 && r.cancelados.quantidade === 0 ? (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm">
          Nenhum título com vencimento neste período foi encontrado no Omie.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Indicador
              titulo="Índice de inadimplência (valor)"
              valor={percentualBr(r.indiceValor)}
              detalhe={
                semBase
                  ? "Nenhum título vencido no período."
                  : `${reais(r.vencidoAberto.valor)} em aberto de ${reais(r.baseVencida.valor)} vencidos`
              }
            />
            <Indicador
              titulo="Índice de inadimplência (títulos)"
              valor={percentualBr(r.indiceQuantidade)}
              detalhe={
                semBase
                  ? "Nenhum título vencido no período."
                  : `${titulos(r.vencidoAberto.quantidade)} em aberto de ${titulos(r.baseVencida.quantidade)} vencidos`
              }
            />
            <Indicador
              titulo="Vencido em aberto"
              valor={reais(r.vencidoAberto.valor)}
              detalhe={titulos(r.vencidoAberto.quantidade)}
            />
            <Indicador
              titulo="A receber (a vencer)"
              valor={reais(r.aVencer.valor)}
              detalhe={`${titulos(r.aVencer.quantidade)} com vencimento a partir de hoje`}
            />
            <Indicador
              titulo="Recebido"
              valor={reais(r.recebido.valor)}
              detalhe={titulos(r.recebido.quantidade)}
            />
            <Indicador
              titulo="Total do período"
              valor={reais(r.total.valor)}
              detalhe={`${titulos(r.total.quantidade)} · ${titulos(r.cancelados.quantidade)} cancelado(s) excluído(s) (${reais(r.cancelados.valor)})`}
            />
          </div>

          <section aria-labelledby="inad-faixas" className="space-y-2">
            <h2 id="inad-faixas" className="font-semibold">
              Vencido em aberto por faixa de atraso
            </h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th scope="col" className="p-2">
                      Faixa
                    </th>
                    <th scope="col" className="p-2 text-right">
                      Valor
                    </th>
                    <th scope="col" className="p-2 text-right">
                      Títulos
                    </th>
                    <th scope="col" className="p-2 text-right">
                      % do vencido em aberto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.faixas.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="p-2">{f.rotulo}</td>
                      <td className="p-2 text-right tabular-nums">{reais(f.valor)}</td>
                      <td className="p-2 text-right tabular-nums">{f.quantidade}</td>
                      <td className="p-2 text-right tabular-nums">
                        {r.vencidoAberto.valor
                          ? percentualBr(
                              Math.round((f.valor * 10000) / r.vencidoAberto.valor) / 100,
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="inad-clientes" className="space-y-2">
            <h2 id="inad-clientes" className="font-semibold">
              Clientes com maior valor vencido em aberto
            </h2>
            {r.clientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum cliente inadimplente no período.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th scope="col" className="p-2">
                        #
                      </th>
                      <th scope="col" className="p-2">
                        Cliente
                      </th>
                      <th scope="col" className="p-2 text-right">
                        Vencido em aberto
                      </th>
                      <th scope="col" className="p-2 text-right">
                        Títulos
                      </th>
                      <th scope="col" className="p-2 text-right">
                        Maior atraso
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.clientes.slice(0, MAX_CLIENTES_TELA).map((c, i) => (
                      <tr key={c.cliente} className="border-t">
                        <td className="p-2 tabular-nums">{i + 1}</td>
                        <td className="p-2">{nomeCliente(c)}</td>
                        <td className="p-2 text-right tabular-nums">{reais(c.valor)}</td>
                        <td className="p-2 text-right tabular-nums">{c.quantidade}</td>
                        <td className="p-2 text-right tabular-nums">{c.maiorAtraso} dias</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {r.clientes.length > MAX_CLIENTES_TELA && (
              <p className="text-xs text-muted-foreground">
                Exibindo {MAX_CLIENTES_TELA} de {r.clientes.length} clientes. A lista completa está
                no CSV.
              </p>
            )}
          </section>

          <section aria-labelledby="inad-vendedores" className="space-y-2">
            <h2 id="inad-vendedores" className="font-semibold">
              Por vendedor (cadastro do Omie)
            </h2>
            {r.vendedores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum título vencido no período.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th scope="col" className="p-2">
                        Vendedor
                      </th>
                      <th scope="col" className="p-2 text-right">
                        Vencido no período
                      </th>
                      <th scope="col" className="p-2 text-right">
                        Em aberto
                      </th>
                      <th scope="col" className="p-2 text-right">
                        Índice (valor)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.vendedores.map((v) => (
                      <tr key={v.vendedor ?? "sem"} className="border-t">
                        <td className="p-2">{nomeVendedor(v)}</td>
                        <td className="p-2 text-right tabular-nums">{reais(v.vencidoValor)}</td>
                        <td className="p-2 text-right tabular-nums">
                          {reais(v.emAbertoValor)} · {titulos(v.emAbertoQuantidade)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {percentualBr(v.indiceValor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Índice = valor (ou quantidade) dos títulos vencidos no período ainda sem baixa no Omie ÷
        valor (ou quantidade) de todos os títulos vencidos no período, sem cancelados. Títulos que
        vencem hoje ainda não contam como vencidos. Baixas parciais não são descontadas: o título
        conta pelo valor do documento até ser baixado. Consulta somente leitura; nada é alterado no
        Omie.
      </p>
    </div>
  );
}

export function MimoInadimplenciaPage() {
  const consultar = useServerFn(consultarInadimplenciaMimo);
  const [rascunho, setRascunho] = useState<PeriodoInadimplencia>(() => periodoPadrao());
  const [periodo, setPeriodo] = useState<PeriodoInadimplencia>(rascunho);
  const [erroPeriodo, setErroPeriodo] = useState("");
  const consulta = useQuery({
    queryKey: ["mimo-inadimplencia", periodo.de, periodo.ate],
    queryFn: () => consultar({ data: periodo }),
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return (
    <section className="space-y-5 p-4 sm:p-6" aria-labelledby="inad-titulo">
      <header>
        <h1 id="inad-titulo" className="text-2xl font-semibold">
          Inadimplência
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Índice de inadimplência do comercial interno a partir das contas a receber do Omie, pelo
          vencimento dos títulos.
        </p>
      </header>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const r = periodoInadimplenciaSchema.safeParse(rascunho);
          if (!r.success) {
            setErroPeriodo(r.error.issues[0]?.message ?? "Período inválido.");
            return;
          }
          setErroPeriodo("");
          setPeriodo(r.data);
        }}
      >
        <label className="grid gap-1 text-sm">
          Vencimento de
          <Input
            type="date"
            value={rascunho.de}
            onChange={(e) => setRascunho({ ...rascunho, de: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          até
          <Input
            type="date"
            value={rascunho.ate}
            onChange={(e) => setRascunho({ ...rascunho, ate: e.target.value })}
          />
        </label>
        <Button disabled={consulta.isFetching}>Consultar</Button>
      </form>
      {erroPeriodo && (
        <p role="alert" className="text-sm text-destructive">
          {erroPeriodo}
        </p>
      )}
      {consulta.isFetching ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Consultando contas a receber no Omie…
        </p>
      ) : consulta.isError ? (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-4 text-sm">
          <p>
            {consulta.error instanceof Error && consulta.error.message
              ? consulta.error.message
              : "Não foi possível consultar o Omie."}
          </p>
          <p className="text-muted-foreground">Nenhum indicador foi calculado.</p>
          <Button variant="outline" onClick={() => void consulta.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : consulta.data && !consulta.data.disponivel ? (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm">
          {consulta.data.mensagem}
        </p>
      ) : consulta.data?.disponivel ? (
        <Painel r={consulta.data.resultado} />
      ) : null}
    </section>
  );
}
