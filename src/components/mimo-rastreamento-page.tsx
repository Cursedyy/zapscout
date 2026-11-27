import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Box, PackageCheck, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MimoRastreamentoFrenet } from "@/components/mimo-rastreamento-frenet";
import { listarRastreamentoMimo } from "@/lib/mimo-rastreamento.functions";
import {
  statusEntrega,
  type FiltroRastreamento,
  type StatusEntrega,
} from "@/lib/mimo-rastreamento";

const inicial: FiltroRastreamento = {
  busca: "",
  status: null,
  inicio: null,
  fim: null,
  pagina: 1,
  porPagina: 20,
};
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function EtiquetaStatus({ status }: { status: StatusEntrega }) {
  const Icone = status === "entregue" ? PackageCheck : status === "enviado" ? Truck : Box;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium">
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      {statusEntrega(status)}
    </span>
  );
}

export function MimoRastreamentoPage() {
  const listar = useServerFn(listarRastreamentoMimo);
  const [filtro, setFiltro] = useState(inicial);
  const [edicao, setEdicao] = useState(inicial);
  const [erroFiltro, setErroFiltro] = useState("");
  const consulta = useQuery({
    queryKey: ["mimo-rastreamento", filtro],
    queryFn: () => listar({ data: filtro }),
    retry: false,
  });
  const paginas = Math.max(1, Math.ceil((consulta.data?.total ?? 0) / filtro.porPagina));
  const resumo = useMemo(() => consulta.data?.itens ?? [], [consulta.data]);

  function aplicar(event: React.FormEvent) {
    event.preventDefault();
    if (edicao.inicio && edicao.fim && edicao.inicio > edicao.fim) {
      setErroFiltro("A data final deve ser igual ou posterior à data inicial.");
      return;
    }
    setErroFiltro("");
    setFiltro({ ...edicao, pagina: 1 });
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Logística</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Rastreamento de entregas
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
          Acompanhe os pedidos da MiMo e consulte as movimentações das etiquetas vinculadas à
          Frenet.
        </p>
      </header>

      {consulta.data?.disponivel && !consulta.data.frenet && (
        <div className="mt-5 flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <p>
            <strong>Rastreio externo indisponível.</strong> A conexão com a Frenet precisa estar
            configurada no servidor.
          </p>
        </div>
      )}

      <form
        onSubmit={aplicar}
        className="mt-6 grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-1">
          Pedido, cliente ou código do serviço
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              value={edicao.busca}
              maxLength={100}
              onChange={(e) => setEdicao({ ...edicao, busca: e.target.value })}
            />
          </div>
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={edicao.status ?? ""}
            onChange={(e) =>
              setEdicao({ ...edicao, status: (e.target.value || null) as StatusEntrega | null })
            }
          >
            <option value="">Todos</option>
            <option value="faturado">Preparando envio</option>
            <option value="enviado">Enviado</option>
            <option value="entregue">Entregue</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Atualizados de
          <Input
            type="date"
            value={edicao.inicio ?? ""}
            onChange={(e) => setEdicao({ ...edicao, inicio: e.target.value || null })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Atualizados até
          <Input
            type="date"
            value={edicao.fim ?? ""}
            onChange={(e) => setEdicao({ ...edicao, fim: e.target.value || null })}
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Aplicar filtros</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEdicao(inicial);
              setFiltro(inicial);
              setErroFiltro("");
            }}
          >
            Limpar filtros
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={consulta.isFetching}
            onClick={() => void consulta.refetch()}
          >
            Atualizar
          </Button>
        </div>
        {erroFiltro && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-4">
            {erroFiltro}
          </p>
        )}
      </form>

      <section aria-labelledby="entregas-encontradas" className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="entregas-encontradas" className="text-lg font-semibold">
            Entregas encontradas
          </h2>
          {consulta.data?.disponivel && (
            <span className="text-sm text-muted-foreground">{consulta.data.total} no total</span>
          )}
        </div>
        {consulta.isPending ? (
          <div role="status" className="grid gap-3">
            <div className="h-40 animate-pulse rounded-2xl bg-muted" />
            <span className="sr-only">Carregando entregas…</span>
          </div>
        ) : consulta.isError ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <p role="alert">Não foi possível carregar as entregas.</p>
              <Button variant="outline" onClick={() => void consulta.refetch()}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        ) : !consulta.data.disponivel ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              O cadastro canônico de pedidos está indisponível no momento.
            </CardContent>
          </Card>
        ) : resumo.length === 0 ? (
          <Card>
            <CardContent className="grid place-items-center gap-2 p-10 text-center">
              <Truck className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">Nenhuma entrega encontrada</p>
              <p className="text-sm text-muted-foreground">
                Ajuste a busca ou os filtros para tentar novamente.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {resumo.map((entrega) => (
              <Card key={entrega.id}>
                <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild variant="link" className="h-auto p-0 text-base font-semibold">
                        <Link
                          to="/mimo/tira-pedido"
                          search={{ busca: String(entrega.numero) }}
                          aria-label={`Abrir pedido ${entrega.numero}`}
                        >
                          Pedido #{entrega.numero}
                        </Link>
                      </Button>
                      <EtiquetaStatus status={entrega.status} />
                    </div>
                    <p className="mt-1 truncate font-medium" title={entrega.cliente}>
                      {entrega.cliente}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Atualizado em{" "}
                      <time dateTime={entrega.atualizadoEm}>
                        {dataHora.format(new Date(entrega.atualizadoEm))}
                      </time>
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Transportadora</dt>
                      <dd className="font-medium">{entrega.transportadora ?? "Não informada"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Código do serviço</dt>
                      <dd className="font-mono text-xs">
                        {entrega.codigoServico ?? "Não informado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Modalidade</dt>
                      <dd>{entrega.modalidade ?? "Não informada"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Prazo cotado</dt>
                      <dd>{entrega.prazo ?? "Não informado"}</dd>
                    </div>
                  </dl>
                  <Button asChild variant="outline">
                    <Link to="/mimo/tira-pedido" search={{ busca: String(entrega.numero) }}>
                      Ver pedido
                    </Link>
                  </Button>
                  {consulta.data.frenet && (
                    <MimoRastreamentoFrenet
                      pedidoId={entrega.id}
                      codigoServico={entrega.codigoServicoFrenet}
                      podeVincular={consulta.data.frenet.podeVincular}
                    />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {consulta.data?.disponivel && consulta.data.total > 0 && (
          <nav
            aria-label="Paginação das entregas"
            className="mt-4 flex flex-wrap items-center gap-3"
          >
            <Button
              variant="outline"
              disabled={consulta.isFetching || filtro.pagina <= 1}
              onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina - 1 })}
            >
              Anterior
            </Button>
            <span className="text-sm">
              Página {Math.min(filtro.pagina, paginas)} de {paginas}
            </span>
            <Button
              variant="outline"
              disabled={consulta.isFetching || filtro.pagina >= paginas}
              onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina + 1 })}
            >
              Próxima
            </Button>
          </nav>
        )}
      </section>
    </div>
  );
}
