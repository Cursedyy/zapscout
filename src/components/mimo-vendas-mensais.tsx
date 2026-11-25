import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { consultarVendasMensais, salvarValorVendas } from "@/lib/mimo-vendas-mensais.functions";
import { valorEmCentavos, type EdicaoVendas, type TotaisVendas, type VendasMensais } from "@/lib/mimo-vendas-mensais";

const reais = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dinheiro = (centavos: number) => reais.format(centavos / 100);
const cobertura = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const diaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

function Valores({ linha, realizado }: { linha: TotaisVendas; realizado?: ReactNode }) {
  return <>
    <td>{dinheiro(linha.orcado)}</td>
    <td>{realizado ?? dinheiro(linha.realizado)}</td>
    <td>{linha.coberturaBps === null ? "—" : cobertura.format(linha.coberturaBps / 10000)}</td>
    <td>{dinheiro(linha.diferenca)}</td>
  </>;
}

type EdicaoAberta = { dia: string | null; esperado: number; texto: string };
export function TabelaVendasMensais({ dados, salvar }: { dados: VendasMensais; salvar: (edicao: EdicaoVendas) => Promise<void> }) {
  const [edicao, setEdicao] = useState<EdicaoAberta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const periodo = mes.format(new Date(dados.competencia + "T00:00:00Z"));

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!edicao || salvando) return;
    const valor = valorEmCentavos(edicao.texto);
    if (valor === null) {
      setAviso("Informe um valor em reais, como 1.234,56.");
      return;
    }
    setSalvando(true);
    setAviso("");
    try {
      await salvar({ competencia: dados.competencia, dia: edicao.dia, esperado: edicao.esperado, valor });
      setEdicao(null);
    } catch (erro) {
      setAviso(erro instanceof Error ? erro.message : "Não foi possível salvar a alteração.");
    } finally {
      setSalvando(false);
    }
  }

  function controle(dia: string | null, atual: number, rotulo: string) {
    if (edicao && edicao.dia === dia) return <form onSubmit={confirmar} className="inline-flex flex-wrap items-center justify-end gap-2">
      <input aria-label={rotulo + " em reais"} autoFocus inputMode="decimal" type="text" value={edicao.texto}
        className="w-32 rounded border border-input bg-background px-2 py-1 text-right text-foreground"
        onFocus={e => e.currentTarget.select()} disabled={salvando}
        onChange={e => { setEdicao({ ...edicao, texto: e.target.value }); setAviso(""); }}
        onKeyDown={e => { if (e.key === "Escape" && !salvando) { setEdicao(null); setAviso(""); } }} />
      <button type="submit" disabled={salvando} className="rounded bg-primary px-2 py-1 text-primary-foreground">{salvando ? "Salvando…" : "Salvar"}</button>
      <button type="button" disabled={salvando} className="underline" onClick={() => { setEdicao(null); setAviso(""); }}>Cancelar</button>
      {aviso && <span role="alert" className="basis-full text-sm text-destructive">{aviso}</span>}
    </form>;
    return <button type="button" aria-label={"Editar " + rotulo} disabled={!!edicao}
      className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 font-medium text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2"
      onClick={() => { setEdicao({ dia, esperado: atual, texto: dinheiro(atual) }); setAviso(""); }}>
      {dia === null && "R$ "}{dinheiro(atual)} <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
    </button>;
  }

  return <details open className="rounded-xl border border-border bg-card shadow-sm">
    <summary className="cursor-pointer px-4 py-3 font-semibold">Vendas diárias · {periodo}</summary>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
      <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Meta mensal</span>{controle(null, dados.total.orcado, "meta mensal")}</div>
      <p className="text-sm text-muted-foreground">{dados.diasUteis > 0 ? `Meta distribuída entre ${dados.diasUteis} dias úteis.` : "Sem dias úteis cadastrados para distribuir a meta."} Clique no realizado do dia para editar.</p>
    </div>
    <div className="max-h-[28rem] overflow-auto rounded-b-xl" role="region" aria-label="Vendas diárias por semana" tabIndex={0}>
      <table className="w-full min-w-[37rem] border-separate border-spacing-0 text-right text-sm tabular-nums [&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-1.5">
        <caption className="sr-only">Vendas em {periodo}, valores em reais</caption>
        <thead className="sticky top-0 z-10 bg-secondary text-secondary-foreground"><tr>
          {["Data", "Dia", "Orçado (R$)", "Realizado (R$)", "Cobertura", "Diferença (R$)"].map((col, i) =>
            <th key={col} scope="col" className={i < 2 ? "text-left" : "whitespace-nowrap"}>{col}</th>)}
        </tr></thead>
        {dados.semanas.map(semana => <tbody key={semana.numero}>
          {semana.dias.map(linha => {
            const data = new Date(linha.data + "T00:00:00Z");
            const rotulo = diaMes.format(data);
            return <tr key={linha.data} className="odd:bg-muted/20">
              <th scope="row" className="text-left font-normal">{rotulo}</th>
              <td className="text-left text-muted-foreground">{linha.feriado ? "Feriado" : diaSemana.format(data)}</td>
              <Valores linha={linha} realizado={controle(linha.data, linha.realizado, "realizado de " + rotulo)} />
            </tr>;
          })}
          <tr className="bg-muted font-semibold"><th scope="row" colSpan={2} className="text-left">Total · S{semana.numero}</th><Valores linha={semana.total} /></tr>
        </tbody>)}
        <tfoot className="sticky bottom-0 bg-secondary font-bold text-secondary-foreground"><tr>
          <th scope="row" colSpan={2} className="text-left">Total do mês</th><Valores linha={dados.total} /></tr></tfoot>
      </table>
    </div>
  </details>;
}

export function MimoVendasMensais() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const consultar = useServerFn(consultarVendasMensais);
  const alterar = useServerFn(salvarValorVendas);
  const queryKey = ["mimo-vendas-mensais", user?.id];
  const q = useQuery({ queryKey, queryFn: () => consultar(), enabled: !!user?.id, staleTime: 60_000 });
  async function salvar(edicao: EdicaoVendas) {
    await qc.cancelQueries({ queryKey });
    try {
      const nova = await alterar({ data: edicao });
      qc.setQueryData(queryKey, nova);
    } finally {
      void qc.invalidateQueries({ queryKey });
    }
  }
  if (!user || (!q.data && !q.isPending && !q.isError)) return null;
  return <section aria-label="Acompanhamento mensal de vendas" className="px-4 pt-6 md:px-8">
    {q.data ? <TabelaVendasMensais key={q.data.competencia} dados={q.data} salvar={salvar} />
      : q.isError ? <p role="alert">Não foi possível carregar as vendas diárias. <button className="underline" onClick={() => q.refetch()}>Tentar novamente</button></p>
      : <p role="status" className="text-sm text-muted-foreground">Carregando vendas diárias…</p>}
  </section>;
}
