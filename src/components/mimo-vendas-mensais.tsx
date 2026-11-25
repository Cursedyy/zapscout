import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { consultarVendasMensais, type TotaisVendas, type VendasMensais } from "@/lib/mimo-vendas-mensais.functions";

const reais = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cobertura = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const diaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

function Valores({ linha }: { linha: TotaisVendas }) {
  return <>
    <td>{reais.format(linha.orcado / 100)}</td>
    <td>{reais.format(linha.realizado / 100)}</td>
    <td>{cobertura.format(linha.coberturaBps / 10000)}</td>
    <td>{reais.format(linha.diferenca / 100)}</td>
  </>;
}

export function TabelaVendasMensais({ dados }: { dados: VendasMensais }) {
  const periodo = mes.format(new Date(dados.competencia + "T00:00:00Z"));
  return <details open className="rounded-xl border border-border bg-card shadow-sm">
    <summary className="cursor-pointer px-4 py-3 font-semibold">Vendas diárias · {periodo}</summary>
    <div className="max-h-[28rem] overflow-auto rounded-b-xl" role="region" aria-label="Vendas diárias por semana" tabIndex={0}>
      <table className="w-full min-w-[37rem] border-separate border-spacing-0 text-right text-sm tabular-nums [&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-1.5">
        <caption className="sr-only">Vendas informadas em {periodo}, valores em reais</caption>
        <thead className="sticky top-0 z-10 bg-secondary text-secondary-foreground"><tr>
          {["Data", "Dia", "Orçado (R$)", "Realizado (R$)", "Cobertura", "Diferença (R$)"].map((col, i) =>
            <th key={col} scope="col" className={i < 2 ? "text-left" : "whitespace-nowrap"}>{col}</th>)}
        </tr></thead>
        {dados.semanas.map(semana => <tbody key={semana.numero}>
          {semana.dias.map(linha => {
            const data = new Date(linha.data + "T00:00:00Z");
            return <tr key={linha.data} className="odd:bg-muted/20">
              <th scope="row" className="text-left font-normal">{diaMes.format(data)}</th>
              <td className="text-left text-muted-foreground">{linha.feriado ? "Feriado" : diaSemana.format(data)}</td>
              <Valores linha={linha} />
            </tr>;
          })}
          <tr className="bg-muted font-semibold"><th scope="row" colSpan={2} className="text-left">Total · S{semana.numero}</th><Valores linha={semana.total} /></tr>
        </tbody>)}
        <tfoot className="sticky bottom-0 bg-secondary font-bold text-secondary-foreground"><tr>
          <th scope="row" colSpan={2} className="text-left">Total do mês</th><Valores linha={dados.total} />
        </tr></tfoot>
      </table>
    </div>
  </details>;
}

export function MimoVendasMensais() {
  const { user } = useAuth();
  const consultar = useServerFn(consultarVendasMensais);
  const q = useQuery({ queryKey: ["mimo-vendas-mensais", user?.id], queryFn: () => consultar(),
    enabled: !!user?.id, staleTime: 60_000 });
  if (!user || (!q.data && !q.isPending && !q.isError)) return null;
  return <section aria-label="Acompanhamento mensal de vendas" className="px-4 pt-6 md:px-8">
    {q.isError ? <p role="alert">Não foi possível carregar as vendas diárias. <button className="underline" onClick={() => q.refetch()}>Tentar novamente</button></p>
      : q.data ? <TabelaVendasMensais dados={q.data} /> : <p role="status" className="text-sm text-muted-foreground">Carregando vendas diárias…</p>}
  </section>;
}
