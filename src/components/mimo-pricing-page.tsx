import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  carregarPricing,
  salvarPricing,
  previaPricing,
  confirmarPricing,
  type RegistroPricing,
} from "@/lib/mimo-pricing.functions";
import {
  CANAIS,
  calcular,
  agregar,
  aplicarPoliticas,
  revisar,
  diferencaPreco,
  conflitosPreco,
  documentoSchema,
  linhaSchema,
  type Documento,
  type Linha,
} from "@/lib/mimo-pricing";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { ClientePricing, PoliticasPricing, NovoSkuPricing } from "./mimo-pricing-forms";

const moeda = (v: string | null | undefined) =>
  v == null
    ? "Indisponível"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: string | null) =>
  v === null ? "Indisponível" : (Number(v) * 100).toFixed(2) + "%";
const vazio: Documento = { nome: "Novo cenário", cliente: null, uf: "", linhas: [], politicas: [] };
export function MimoPricingPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mimo-pricing"], queryFn: () => carregarPricing() });
  const [doc, setDoc] = useState<Documento>(vazio),
    [registro, setRegistro] = useState<RegistroPricing | null>(null),
    [sku, setSku] = useState("M001"),
    [canal, setCanal] = useState<(typeof CANAIS)[number]>("Venda Direta");
  const [previa, setPrevia] = useState<Awaited<ReturnType<typeof previaPricing>> | null>(null),
    [busy, setBusy] = useState(false);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["mimo-pricing"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na operação");
    } finally {
      setBusy(false);
    }
  };
  const abrir = (r: RegistroPricing) => {
    setRegistro(r);
    setDoc(structuredClone(r.dados));
    setSku(r.dados.linhas[0]?.codigo ?? "M001");
  };
  const linhas = doc.linhas.map((l) => aplicarPoliticas(l, doc.politicas, doc.cliente, doc.uf));
  const selecionada = doc.linhas.find((l) => l.codigo === sku && l.canal === canal);
  const total = agregar(linhas);
  const editar = (patch: Partial<Linha>) =>
    setDoc({ ...doc, linhas: doc.linhas.map((l) => (l === selecionada ? { ...l, ...patch } : l)) });
  const salvar = async (tipo: "base" | "cenario", copia = false) => {
    const dados = documentoSchema.parse(doc);
    const id = await salvarPricing({
      data: {
        id: copia ? null : (registro?.id ?? null),
        versao: copia ? 0 : (registro?.versao ?? 0),
        tipo,
        dados,
      },
    });
    await qc.invalidateQueries({ queryKey: ["mimo-pricing"] });
    const rs = await carregarPricing();
    const salvo = rs.find((r) => r.id === id);
    if (salvo) abrir(salvo);
    toast.success("Estudo salvo.");
  };
  if (q.isPending) return <p className="p-8">Carregando Árvore Comercial…</p>;
  if (q.error)
    return (
      <p role="alert" className="p-8">
        {q.error.message}
      </p>
    );
  return (
    <div className="space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Árvore Comercial</h1>
        <p className="text-sm text-muted-foreground">
          Estudos independentes do Tira-pedido. Valores totais são projeções dos volumes informados.
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() => action(async () => setPrevia(await previaPricing()))}
        >
          Revisar importação inicial
        </Button>
        <select
          aria-label="Abrir estudo"
          className="rounded border bg-card p-2"
          value={registro?.id ?? ""}
          onChange={(e) => {
            const r = q.data?.find((r) => r.id === e.target.value);
            if (r) abrir(r);
          }}
        >
          <option value="">Abrir base ou cenário salvo</option>
          {q.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.tipo}: {r.dados.nome} · v{r.versao}
            </option>
          ))}
        </select>
      </div>
      {previa && (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">Prévia de importação</h2>
          <p>
            {previa.origem} · {previa.dados.linhas.length} registros · {previa.revisao.novos} novos
            · {previa.revisao.alterados} alterações
          </p>
          <p className="text-sm">
            Confirmar substitui a base atual. Cenários salvos permanecem independentes. Fórmulas do
            arquivo não são executadas.
          </p>
          {[...previa.revisao.erros, ...previa.revisao.avisos].map((a) => (
            <p key={a} role="status">
              {a}
            </p>
          ))}
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {["SKU", "Canal", "Custo original", "Preço original", "Anterior → novo"].map(
                    (t) => (
                      <th key={t}>{t}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {previa.dados.linhas.map((l) => {
                  const antes = previa.base?.dados.linhas.find(
                    (a) => a.codigo === l.codigo && a.canal === l.canal,
                  );
                  return (
                    <tr key={l.codigo + l.canal}>
                      <td>{l.codigo}</td>
                      <td>{l.canal}</td>
                      <td>{moeda(l.custo)}</td>
                      <td>{moeda(l.preco)}</td>
                      <td>
                        {antes
                          ? `${moeda(antes.custo)} / ${moeda(antes.preco)} → ${moeda(l.custo)} / ${moeda(l.preco)}`
                          : "Novo"}
                        <details className="mt-1">
                          <summary>Precisão original</summary>
                          <p>Custo original: {l.custo ?? "Indisponível"}</p>
                          <p>Preço original: {l.preco ?? "Indisponível"}</p>
                          {antes && (
                            <p>
                              Anterior: custo {antes.custo ?? "Indisponível"} / preço{" "}
                              {antes.preco ?? "Indisponível"}
                            </p>
                          )}
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button
            disabled={busy || !!previa.revisao.erros.length}
            onClick={() =>
              action(async () => {
                await confirmarPricing({
                  data: { hash: previa.hash, versao: previa.base?.versao ?? 0 },
                });
                const registros = await carregarPricing();
                const base = registros.find((r) => r.tipo === "base");
                if (base) abrir(base);
                setPrevia(null);
                toast.success("Base importada. Pronta para simular.");
              })
            }
          >
            Confirmar importação
          </Button>
          <Button variant="outline" onClick={() => setPrevia(null)}>
            Cancelar
          </Button>
        </section>
      )}
      {!!doc.linhas.length && (
        <>
          <section className="grid gap-3 rounded-xl border p-4 md:grid-cols-3">
            <label>
              Nome
              <Input value={doc.nome} onChange={(e) => setDoc({ ...doc, nome: e.target.value })} />
            </label>
            <label>
              UF
              <Input
                maxLength={2}
                value={doc.uf}
                placeholder="Sem UF"
                onChange={(e) => setDoc({ ...doc, uf: e.target.value.toUpperCase() })}
              />
            </label>
            <ClientePricing
              value={doc.cliente}
              onChange={(cliente, uf) => setDoc({ ...doc, cliente, uf: uf ?? doc.uf })}
            />
            <Button disabled={busy} onClick={() => action(() => salvar("cenario", true))}>
              Salvar como alternativa
            </Button>
            <Button
              disabled={busy || !registro}
              onClick={() => action(() => salvar(registro!.tipo))}
            >
              {registro?.tipo === "base" ? "Atualizar base explicitamente" : "Salvar cenário"}
            </Button>
          </section>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["Faturamento previsto", moeda(total.receita)],
              ["Contribuição prevista", moeda(total.contribuicao)],
              ["Margem ponderada", pct(total.percentual)],
              ["Resultado líquido estimado", moeda(total.liquido)],
            ].map(([t, v]) => (
              <div key={t} className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">{t}</p>
                <p className="text-xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <p className="text-sm">
            {total.volumes} registros com volumes previstos. Sem volume, consulte o resultado por
            unidade abaixo. Percentuais e taxas são frações: 0.15 = 15%.
          </p>
          <label>
            SKU{" "}
            <select
              className="rounded border bg-card p-2"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            >
              {[...new Set(doc.linhas.map((l) => l.codigo))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="overflow-auto rounded-xl border">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr>
                  <th className="p-3">Árvore por SKU</th>
                  {CANAIS.map((c) => (
                    <th key={c} className="p-3">
                      <button onClick={() => setCanal(c)}>{c}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  "Custo industrial",
                  "Preço de tabela",
                  "Preço efetivo negociado",
                  "Preço sugerido",
                  "Impostos",
                  "Despesas variáveis / un.",
                  "Margem bruta / un.",
                  "Contribuição / un.",
                  "Contribuição %",
                  "Líquido estimado / un.",
                  "Preço mínimo tabela",
                  "PDV projetado",
                ].map((nome, i) => (
                  <tr key={nome} className="border-t">
                    <th className="p-3 text-left">{nome}</th>
                    {CANAIS.map((c) => {
                      const l = linhas.find((l) => l.codigo === sku && l.canal === c);
                      if (!l) return <td key={c}>Ausente</td>;
                      const r = calcular(l, true);
                      const vs = [
                        l.custo,
                        l.preco,
                        r.efetivo,
                        l.sugerido,
                        r.impostos,
                        r.variaveis,
                        r.bruta,
                        r.contribuicao,
                        r.percentual,
                        r.liquido,
                        r.minimo,
                        r.pdv,
                      ];
                      return (
                        <td key={c} className="p-3">
                          {i === 8 ? pct(vs[i] ?? null) : moeda(vs[i])}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border p-4">
            <h2 className="font-semibold">
              Diferenças de preço de tabela em relação à Venda Direta
            </h2>
            {CANAIS.filter((c) => c !== "Venda Direta").map((c) => {
              const d = diferencaPreco(
                linhas.find((l) => l.codigo === sku && l.canal === "Venda Direta")?.preco ?? null,
                linhas.find((l) => l.codigo === sku && l.canal === c)?.preco ?? null,
              );
              return (
                <p key={c}>
                  {c}: {moeda(d.valor)} ({pct(d.percentual)})
                </p>
              );
            })}
          </div>
          {[
            ...revisar(doc.linhas).avisos,
            ...conflitosPreco(linhas.filter((l) => l.codigo === sku)),
          ].map((a) => (
            <p key={a} className="text-amber-700">
              {a}
            </p>
          ))}
          {selecionada && (
            <section className="space-y-4 rounded-xl border p-4">
              <h2 className="font-semibold">
                Simular {selecionada.produto} · {canal}
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    "preco",
                    "custo",
                    "desconto",
                    "quantidade",
                    "bonus",
                    "sugerido",
                    "impostos",
                    "fixas",
                    "meta",
                  ] as const
                ).map((k) => (
                  <label key={k}>
                    {
                      {
                        preco: "Preço de tabela (R$)",
                        custo: "Custo fábrica (R$)",
                        desconto: "Desconto (fração)",
                        quantidade: "Quantidade faturada prevista",
                        bonus: "Quantidade bonificada",
                        sugerido: "Preço sugerido (R$)",
                        impostos: "Impostos (fração)",
                        fixas: "Rateio fixo (fração)",
                        meta: "Meta de contribuição (fração)",
                      }[k]
                    }
                    <Input
                      inputMode="decimal"
                      value={selecionada[k] ?? ""}
                      onChange={(e) =>
                        editar({
                          [k]: e.target.value === "" ? null : e.target.value.replace(",", "."),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="text-sm">
                Despesas por unidade incidem sobre unidades entregues, incluindo bonificações.
                Comissão do Broker entra uma única vez nas despesas; o Broker não compra nem
                revende.
              </p>
              {selecionada.despesas.map((e, i) => (
                <div className="flex flex-wrap gap-2" key={i}>
                  <Input
                    aria-label="Nome da despesa"
                    className="w-44"
                    value={e.nome}
                    onChange={(ev) =>
                      editar({
                        despesas: selecionada.despesas.map((a, j) =>
                          j === i ? { ...a, nome: ev.target.value } : a,
                        ),
                      })
                    }
                  />
                  <select
                    aria-label="Base da despesa"
                    className="rounded border bg-card"
                    value={e.base}
                    onChange={(ev) =>
                      editar({
                        despesas: selecionada.despesas.map((a, j) =>
                          j === i ? { ...a, base: ev.target.value as typeof e.base } : a,
                        ),
                      })
                    }
                  >
                    <option value="faturamento">Fração do faturamento</option>
                    <option value="unidade">R$ por unidade entregue</option>
                    <option value="operacao">R$ por operação</option>
                  </select>
                  <Input
                    aria-label="Valor da despesa"
                    className="w-36"
                    value={e.valor}
                    onChange={(ev) =>
                      editar({
                        despesas: selecionada.despesas.map((a, j) =>
                          j === i ? { ...a, valor: ev.target.value } : a,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="outline"
                    onClick={() =>
                      editar({ despesas: selecionada.despesas.filter((_, j) => i !== j) })
                    }
                  >
                    Remover
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  editar({
                    despesas: [
                      ...selecionada.despesas,
                      { nome: "Nova despesa", base: "operacao", valor: "0" },
                    ],
                  })
                }
              >
                Adicionar despesa
              </Button>
              {(canal === "Distribuidor"
                ? ["distribuidor", "varejista"]
                : ["Venda Direta", "Televendas", "Broker"].includes(canal)
                  ? ["varejista"]
                  : []
              ).map((k) => {
                const key = k as "distribuidor" | "varejista";
                return (
                  <div className="flex items-center gap-2" key={key}>
                    <label>
                      {key}
                      <select
                        className="m-2 rounded border bg-card"
                        value={selecionada[key]?.modo ?? ""}
                        onChange={(e) =>
                          editar({
                            [key]: e.target.value
                              ? { modo: e.target.value, taxa: selecionada[key]?.taxa ?? "0" }
                              : null,
                          })
                        }
                      >
                        <option value="">Pendente</option>
                        <option value="margem">Margem</option>
                        <option value="markup">Markup</option>
                      </select>
                    </label>
                    <Input
                      aria-label={`Taxa ${key}`}
                      className="w-32"
                      value={selecionada[key]?.taxa ?? ""}
                      onChange={(e) =>
                        editar({
                          [key]: { modo: selecionada[key]?.modo ?? "margem", taxa: e.target.value },
                        })
                      }
                    />
                  </div>
                );
              })}
              <Resultado
                linha={aplicarPoliticas(selecionada, doc.politicas, doc.cliente, doc.uf)}
              />
            </section>
          )}
          <PoliticasPricing
            value={doc.politicas}
            onChange={(politicas) => setDoc({ ...doc, politicas })}
          />
          <NovoSkuPricing
            template={doc.linhas[0]}
            onAdd={(l) => {
              const r = documentoSchema.safeParse({ ...doc, linhas: [...doc.linhas, l] });
              if (r.success) {
                setDoc(r.data);
                setSku(l.codigo);
                setCanal(l.canal);
              } else toast.error("SKU/canal já cadastrado ou dados inválidos.");
            }}
          />
          <section className="rounded-xl border p-4">
            <h2 className="font-semibold">Oportunidades por contribuição total prevista</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {[
                      "SKU / canal",
                      "Preço tabela",
                      "Quantidade",
                      "Contribuição/un.",
                      "Contribuição total",
                      "PDV por cliente",
                      "Alertas",
                    ].map((t) => (
                      <th key={t} className="p-2 text-left">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas
                    .filter((l) => l.quantidade !== null)
                    .map((l) => ({ l, r: calcular(l) }))
                    .sort(
                      (a, b) =>
                        Number(b.r.contribuicao ?? "-Infinity") -
                        Number(a.r.contribuicao ?? "-Infinity"),
                    )
                    .map(({ l, r }) => (
                      <tr key={l.codigo + l.canal} className="border-t">
                        <td className="p-2">
                          {l.codigo} / {l.canal}
                        </td>
                        <td>{moeda(l.preco)}</td>
                        <td>{l.quantidade}</td>
                        <td>{moeda(calcular(l, true).contribuicao)}</td>
                        <td>{moeda(r.contribuicao)}</td>
                        <td>{moeda(r.pdv)}</td>
                        <td>{r.pendentes.join("; ")}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-xl border p-4">
            <h2 className="font-semibold">Comparar estudos salvos</h2>
            {q.data?.map((r) => {
              const a = agregar(
                r.dados.linhas.map((l) =>
                  aplicarPoliticas(l, r.dados.politicas, r.dados.cliente, r.dados.uf),
                ),
              );
              return (
                <details key={r.id} className="border-b py-2">
                  <summary>
                    {r.dados.nome} · v{r.versao} · contribuição {moeda(a.contribuicao)} · margem{" "}
                    {pct(a.percentual)}
                  </summary>
                  <p>
                    UF {r.dados.uf || "ausente"} · cliente {r.dados.cliente || "sem vínculo"} ·
                    atualizado {new Date(r.updated_at).toLocaleString("pt-BR")}
                  </p>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full whitespace-nowrap text-sm">
                      <thead>
                        <tr>
                          {[
                            "SKU / canal",
                            "Preço tabela",
                            "Custo",
                            "Desconto",
                            "Volume",
                            "Bonificadas",
                            "Impostos",
                            "Rateio fixo",
                            "Meta",
                            "Contribuição prevista",
                            "PDV projetado",
                          ].map((t) => (
                            <th className="p-2 text-left" key={t}>
                              {t}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {r.dados.linhas.map((raw) => {
                          const l = aplicarPoliticas(
                            raw,
                            r.dados.politicas,
                            r.dados.cliente,
                            r.dados.uf,
                          );
                          const resultado = calcular(l);
                          return (
                            <tr key={l.codigo + l.canal} className="border-t">
                              <td className="p-2">
                                {l.codigo} / {l.canal}
                              </td>
                              <td>{moeda(l.preco)}</td>
                              <td>{moeda(l.custo)}</td>
                              <td>{pct(l.desconto)}</td>
                              <td>{l.quantidade ?? "Ausente"}</td>
                              <td>{l.bonus}</td>
                              <td>{pct(l.impostos)}</td>
                              <td>{pct(l.fixas)}</td>
                              <td>{pct(l.meta)}</td>
                              <td>{moeda(resultado.contribuicao)}</td>
                              <td>{moeda(resultado.pdv)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
function Resultado({ linha }: { linha: Linha }) {
  try {
    linhaSchema.parse(linha);
    const r = calcular(linha);
    return (
      <div className="space-y-2">
        <h3 className="font-semibold">Memória de cálculo</h3>
        <p>Faturamento = quantidade × preço × (1 − desconto): {moeda(r.receita)}</p>
        <p>
          Margem bruta = faturamento − impostos − custo × (faturadas + bonificadas):{" "}
          {moeda(r.bruta)}
        </p>
        <p>
          Contribuição = margem bruta − despesas variáveis: {moeda(r.contribuicao)} (
          {pct(r.percentual)})
        </p>
        {r.despesas?.map((e, i) => (
          <p key={i}>
            {e.nome} ({e.base}): {moeda(e.valor)}
          </p>
        ))}
        <p>Líquido estimado = contribuição − faturamento × rateio fixo: {moeda(r.liquido)}</p>
        <p>
          Preço mínimo = custos não percentuais ÷ [quantidade × (1 − desconto) × (1 − impostos −
          despesas percentuais − meta)]:{" "}
          {r.minimo === null ? "Sem solução válida ou parâmetros pendentes" : moeda(r.minimo)}
        </p>
        {r.etapas.map((e) => (
          <p key={e.nome}>
            {e.nome}: {moeda(e.entrada)} → {moeda(e.saida)}. Acréscimo {moeda(e.acrescimo)},
            evolução {pct(e.evolucao)}, participação no PDV {pct(e.participacao)}. Acréscimo não
            representa lucro líquido.
          </p>
        ))}
        <p role="status" className="text-amber-700">
          {r.pendentes.join(" · ")}
        </p>
      </div>
    );
  } catch {
    return <p role="alert">Revise os valores. Use números positivos e frações válidas.</p>;
  }
}
