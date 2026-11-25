import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { retornoCampanhasMimo } from "@/lib/mimo-retorno-campanhas.functions";
import { filtroRetornoSchema } from "@/lib/mimo-retorno-campanhas";
import { periodoInicialMimo } from "@/lib/mimo-periodo";

const reais = (centavos: number | null) =>
  centavos === null
    ? "—"
    : (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (valor: number | null) => (valor === null ? "—" : valor.toLocaleString("pt-BR"));
export function MimoRetornoCampanhasPage() {
  const [periodo, setPeriodo] = useState(() => {
    const p = periodoInicialMimo(30);
    return { inicio: p.inicio, fim: p.fim };
  });
  const [rascunho, setRascunho] = useState(periodo);
  const [campanha, setCampanha] = useState("");
  const [erro, setErro] = useState("");
  const consultar = useServerFn(retornoCampanhasMimo);
  const consulta = useQuery({
    queryKey: ["mimo-retorno-campanhas", periodo],
    queryFn: () => consultar({ data: periodo }),
    retry: false,
  });
  const dados = consulta.data;
  const linhas = dados?.campanhas.filter((c) => !campanha || c.campanha === campanha) ?? [];
  return (
    <section className="space-y-5 p-4 sm:p-6" aria-labelledby="retorno-titulo">
      <header>
        <h1 id="retorno-titulo" className="text-2xl font-semibold">
          Investimento e retorno
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Meta Ads importado, leads do CRM e pedidos canônicos MiMo.
        </p>
      </header>
      <form
        aria-label="Período dos indicadores"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const resultado = filtroRetornoSchema.safeParse(rascunho);
          if (!resultado.success) {
            setErro(resultado.error.issues[0]?.message ?? "Período inválido.");
            return;
          }
          setErro("");
          setCampanha("");
          setPeriodo(resultado.data);
        }}
      >
        <label className="grid gap-1 text-sm">
          Início
          <Input
            type="date"
            value={rascunho.inicio}
            onChange={(e) => setRascunho({ ...rascunho, inicio: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Fim
          <Input
            type="date"
            value={rascunho.fim}
            onChange={(e) => setRascunho({ ...rascunho, fim: e.target.value })}
          />
        </label>
        <Button>Aplicar período</Button>
        <Button
          type="button"
          variant="outline"
          disabled={consulta.isFetching}
          onClick={() => void consulta.refetch()}
        >
          Atualizar
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Período aplicado: {periodo.inicio.split("-").reverse().join("/")} a{" "}
        {periodo.fim.split("-").reverse().join("/")}.
      </p>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <div className="rounded-lg border bg-card p-4 text-sm space-y-2">
        <p>
          Não há identificador estável comum entre as campanhas importadas e os leads. Mesmo nomes
          iguais não comprovam atribuição: pedidos e receita ficam em “Não atribuídos”. CAC e ROAS
          por campanha permanecem indisponíveis.
        </p>
        <p>
          Leads Meta são informados pela plataforma e não são somados aos leads do CRM. CPL Meta =
          investimento ÷ leads Meta; não é CPL do CRM.
        </p>
        <p>
          A coorte reúne leads que entraram no período e pedidos confirmados pela primeira vez no
          mesmo período. Receita corresponde ao valor atual dos pedidos faturados, enviados ou
          entregues dessa coorte; não representa recebimentos nem lucro. Cancelados não contam.
        </p>
      </div>
      {consulta.isPending && <p role="status">Carregando investimento e retorno…</p>}
      {consulta.isError && (
        <div role="alert">
          <p>Não foi possível carregar os indicadores. Reduza o período ou tente novamente.</p>
          <Button variant="outline" onClick={() => void consulta.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {dados && !consulta.isError && (
        <>
          {consulta.isFetching && <p role="status">Atualizando indicadores…</p>}
          {dados.avisos.parciais > 0 && (
            <p role="status">
              {dados.avisos.parciais} linhas Meta cobrem datas fora do período e não foram somadas.
              Prefira relatórios diários.
            </p>
          )}
          <label className="grid max-w-md gap-1 text-sm">
            Campanha importada
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={campanha}
              onChange={(e) => setCampanha(e.target.value)}
            >
              <option value="">Todas</option>
              {dados.campanhas.map((c) => (
                <option key={c.campanha} value={c.campanha}>
                  {c.campanha || "Sem nome"}
                </option>
              ))}
            </select>
          </label>
          {!linhas.length ? (
            <p>Nenhuma campanha importada integralmente neste período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" aria-label="Indicadores por campanha">
                <thead>
                  <tr>
                    {[
                      "Campanha importada",
                      "Investimento",
                      "Leads Meta",
                      "CPL Meta",
                      "Leads CRM",
                      "Pedidos fechados",
                      "Receita atribuída",
                      "CAC",
                      "ROAS",
                    ].map((s) => (
                      <th key={s} scope="col" className="p-2">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((c) => (
                    <tr key={c.campanha} className="border-t">
                      <td className="p-2">
                        {c.campanha || "Sem nome"}
                        {c.sobreposto && (
                          <p className="text-xs text-destructive">
                            Períodos ou níveis sobrepostos: total indisponível.
                          </p>
                        )}
                      </td>
                      <td className="p-2 whitespace-nowrap">{reais(c.investimento)}</td>
                      <td className="p-2">{numero(c.leadsMeta)}</td>
                      <td className="p-2 whitespace-nowrap">{reais(c.cplMeta)}</td>
                      {["leads", "pedidos", "receita", "cac", "roas"].map((k) => (
                        <td key={k} className="p-2" aria-label="Indisponível: sem vínculo estável">
                          —
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            “—” indica dado ausente, sobreposição ou vínculo não comprovado; zero só aparece quando
            conhecido. Nenhum código de campanha ou centro de custo comum está cadastrado nas
            fontes.
          </p>
          <section aria-labelledby="nao-atribuidos" className="rounded-xl border p-4 space-y-3">
            <h2 id="nao-atribuidos" className="text-lg font-semibold">
              Não atribuídos · período completo
            </h2>
            <p className="text-sm">
              Este bloco não é filtrado pelo nome da campanha, pois não há vínculo comprovado.
            </p>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Leads CRM da coorte", numero(dados.naoAtribuidos.leads)],
                ["Pedidos fechados da coorte", numero(dados.naoAtribuidos.pedidos)],
                ["Clientes com pedido na coorte", numero(dados.naoAtribuidos.clientes)],
                ["Receita faturada da coorte", reais(dados.naoAtribuidos.receitaFaturada)],
              ].map(([titulo, valor]) => (
                <div key={titulo}>
                  <dt className="text-sm text-muted-foreground">{titulo}</dt>
                  <dd className="text-xl font-semibold">{valor}</dd>
                </div>
              ))}
            </dl>
            {!dados.avisos.pedidosDisponiveis && (
              <p role="status">
                Pedidos canônicos indisponíveis para este cargo ou ainda não ativados. Isso não
                significa receita zero.
              </p>
            )}
            {!!dados.naoAtribuidos.pedidosForaCoorte && (
              <p className="text-sm">
                Separadamente: {dados.naoAtribuidos.pedidosForaCoorte} pedidos do período sem lead
                na coorte; receita faturada de {reais(dados.naoAtribuidos.receitaForaCoorte)}. Não
                somados à coorte nem atribuídos a campanhas.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
