import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Radar, Save, ChevronDown, ChevronUp, Loader2, Lock, Sparkles, Info, Clock, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { LeadCard } from "@/components/lead-card";
import { ExportButton } from "@/components/export-button";
import { UpgradeModal } from "@/components/upgrade-modal";
import { type MockLead } from "@/data/mock-leads";
import { usePlano, useStore } from "@/store/app-store";
import { calcularScoreObjetivo, classificar, type ScoreClassificacao } from "@/lib/lead-score";
import { buscarLeadsFallback } from "@/lib/buscar-leads-fallback.functions";
import { buscarLeadsReais } from "@/lib/buscar-leads.functions";
import { BuscarLoading } from "@/components/buscar-loading";
import { NichoCombobox } from "@/components/nicho-combobox";
import { CidadeCombobox } from "@/components/cidade-combobox";
import { toast } from "sonner";

export const Route = createFileRoute("/app/buscar")({
  head: () => ({ meta: [{ title: "Buscar leads — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: BuscarPage,
});





function BuscarPage() {
  const plano = usePlano();
  const { buscasUsadas, incrementarBusca, addBuscaSalva, buscasSalvas, leads: leadsCrm } = useStore();
  const [filtradosCount, setFiltradosCount] = useState(0);

  const normalizar = (s: string) =>
    (s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const prospectadosSet = useMemo(() => {
    const set = new Set<string>();
    for (const l of leadsCrm) {
      if (l.nome) set.add(normalizar(l.nome) + "|" + normalizar(l.cidade ?? ""));
      const tel = (l.telefone ?? "").replace(/\D/g, "");
      if (tel) set.add("tel:" + tel);
    }
    return set;
  }, [leadsCrm]);

  const filtrarJaProspectados = (lista: MockLead[]) =>
    lista.filter((l) => {
      const chave = normalizar(l.nome) + "|" + normalizar(l.cidade ?? "");
      const tel = (l.telefone ?? "").replace(/\D/g, "");
      if (prospectadosSet.has(chave)) return false;
      if (tel && prospectadosSet.has("tel:" + tel)) return false;
      return true;
    });
  const [nicho, setNicho] = useState("");
  const [cidade, setCidade] = useState("São Paulo - SP");
  const [raio, setRaio] = useState(15);
  const [advOpen, setAdvOpen] = useState(false);
  const [semSite, setSemSite] = useState(false);
  const [avaliacaoMin, setAvaliacaoMin] = useState(0);
  const [maxResultados, setMaxResultados] = useState(20);
  useEffect(() => {
    const teto = plano.id === "dono" ? 100 : 20;
    if (maxResultados > teto) setMaxResultados(teto);
  }, [plano.id, maxResultados]);
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<MockLead[] | null>(null);
  const [tempo, setTempo] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState({ t: "", d: "" });
  const [ordenacao, setOrdenacao] = useState<"score" | "avaliacao" | "nome">("score");
  const [filtroNivel, setFiltroNivel] = useState<"todos" | ScoreClassificacao>("todos");
  const [totalBruto, setTotalBruto] = useState(0);
  const [totalBrutoFonte, setTotalBrutoFonte] = useState(0);
  const [buscaSource, setBuscaSource] = useState<"apify" | "serpapi" | "n8n" | null>(null);
  const [buscasRecentes, setBuscasRecentes] = useState<{ nicho: string; cidade: string; ts: number }[]>([]);

  // Carrega buscas recentes do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("zs:buscas-recentes");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setBuscasRecentes(parsed.slice(0, 8));
      }
    } catch { /* noop */ }
  }, []);

  const adicionarBuscaRecente = (n: string, c: string) => {
    const key = `${n.toLowerCase().trim()}|${c.toLowerCase().trim()}`;
    setBuscasRecentes((prev) => {
      const filtrado = prev.filter((b) => `${b.nicho.toLowerCase().trim()}|${b.cidade.toLowerCase().trim()}` !== key);
      const next = [{ nicho: n.trim(), cidade: c.trim(), ts: Date.now() }, ...filtrado].slice(0, 6);
      try { localStorage.setItem("zs:buscas-recentes", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const removerBuscaRecente = (key: string) => {
    setBuscasRecentes((prev) => {
      const next = prev.filter((b) => `${b.nicho.toLowerCase().trim()}|${b.cidade.toLowerCase().trim()}` !== key);
      try { localStorage.setItem("zs:buscas-recentes", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  // Pré-cálculo objetivo (instantâneo, sem IA) para ordenar e filtrar.
  const resultadosComScore = useMemo(() => {
    if (!resultados) return null;
    return resultados.map((l) => {
      const { scoreObjetivo } = calcularScoreObjetivo(l);
      return { lead: l, scoreObj: scoreObjetivo, classe: classificar(scoreObjetivo) };
    });
  }, [resultados]);

  const resultadosOrdenados = useMemo(() => {
    if (!resultadosComScore) return null;
    const filtrados = resultadosComScore.filter((r) => filtroNivel === "todos" || r.classe === filtroNivel);
    const sorted = [...filtrados].sort((a, b) => {
      if (ordenacao === "score") return b.scoreObj - a.scoreObj;
      if (ordenacao === "avaliacao") return b.lead.avaliacao - a.lead.avaliacao;
      return a.lead.nome.localeCompare(b.lead.nome);
    });
    return sorted.map((r) => r.lead);
  }, [resultadosComScore, ordenacao, filtroNivel]);

  const contagens = useMemo(() => {
    if (!resultadosComScore) return { quentes: 0, mornos: 0, frios: 0 };
    return {
      quentes: resultadosComScore.filter((r) => r.classe === "QUENTE").length,
      mornos: resultadosComScore.filter((r) => r.classe === "MORNO").length,
      frios: resultadosComScore.filter((r) => r.classe === "FRIO").length,
    };
  }, [resultadosComScore]);

  const limiteAtingido = plano.buscas_mes < 9999 && buscasUsadas >= plano.buscas_mes;

  const buscar = async () => {
    if (!nicho.trim()) { toast.error("Informe o nicho"); return; }
    if (!cidade.trim()) { toast.error("Informe a cidade"); return; }
    if (limiteAtingido) {
      setUpgradeMsg({ t: "Limite de buscas atingido", d: `Você usou todas as ${plano.buscas_mes} buscas do seu plano ${plano.nome}.` });
      setUpgradeOpen(true);
      return;
    }
    setLoading(true);
    setResultados(null);
    setTotalBruto(0);
    setTotalBrutoFonte(0);
    setBuscaSource(null);
    const start = performance.now();

    try {
      const resp = await buscarLeadsFallback({
        data: {
          nicho: nicho.trim(),
          cidade: cidade.trim(),
          maxResultados,
          semSite,
          avaliacaoMin,
          raioKm: raio,
        },
      });

      setTotalBruto(resp.leads.length);
      setTotalBrutoFonte(resp.totalBrutoFonte ?? resp.leads.length);
      setBuscaSource(resp.source);

      if (resp.leads.length === 0) {
        toast.error(resp.error ?? "Nenhum negócio encontrado. Tente outro nicho ou cidade.");
        setResultados([]);
        setFiltradosCount(0);
      } else {
        const novos = filtrarJaProspectados(resp.leads as MockLead[]);
        const filtrados = resp.leads.length - novos.length;
        setResultados(novos);
        setFiltradosCount(filtrados);
        incrementarBusca();
        adicionarBuscaRecente(nicho, cidade);
        if (filtrados > 0) {
          toast.success(`${filtrados} lead${filtrados > 1 ? "s" : ""} já prospectado${filtrados > 1 ? "s" : ""} foram ocultados`);
        }
      }
    } catch (err) {
      console.error(err);
      // Último recurso: tenta o fluxo legado via n8n
      try {
        const legado = await buscarLeadsReais({
          data: {
            nicho: nicho.trim(),
            cidade: cidade.trim(),
            maxResultados,
          },
        });
        setTotalBruto(legado.leads.length);
        setTotalBrutoFonte(legado.leads.length);
        setBuscaSource("n8n");
        if (legado.leads.length > 0) {
          const novos = filtrarJaProspectados(legado.leads as MockLead[]);
          const filtrados = legado.leads.length - novos.length;
          setResultados(novos);
          setFiltradosCount(filtrados);
          incrementarBusca();
          adicionarBuscaRecente(nicho, cidade);
          if (filtrados > 0) {
            toast.success(`${filtrados} lead${filtrados > 1 ? "s" : ""} já prospectado${filtrados > 1 ? "s" : ""} foram ocultados`);
          }
        } else {
          toast.error(legado.error ?? "Erro ao buscar leads. Tente novamente.");
          setResultados([]);
          setFiltradosCount(0);
        }
      } catch {
        toast.error("Erro ao buscar leads. Tente novamente.");
        setResultados([]);
        setFiltradosCount(0);
      }
    } finally {
      setTempo((performance.now() - start) / 1000);
      setLoading(false);
    }
  };

  const mensagensAviso = useMemo(() => {
    if (loading || resultados === null) return [];
    const msgs: string[] = [];
    const solicitado = maxResultados;
    const retornado = totalBruto;
    const percentual = solicitado > 0 ? retornado / solicitado : 1;
    const removidosPorFiltro = Math.max(0, totalBrutoFonte - retornado);

    if (removidosPorFiltro > 0) {
      msgs.push(`Encontramos ${totalBrutoFonte} negócios, mas ${removidosPorFiltro} foram removidos pelos filtros (sem site / avaliação mínima). Desative filtros para ver todos.`);
    } else if (retornado === 0) {
      msgs.push("Nenhum negócio encontrado. Tente um nicho diferente ou uma cidade maior.");
    } else if (percentual < 0.5 && retornado < 50) {
      msgs.push("Poucos resultados — essa cidade tem poucos negócios nesse nicho. Tente ampliar o raio ou buscar em outra cidade.");
    } else if (retornado < solicitado) {
      if (buscaSource === "apify") {
        msgs.push("O plano atual do Apify limita o número de resultados por busca. Atualize o plano Apify para obter mais leads.");
      } else if (buscaSource === "serpapi") {
        msgs.push("Busca realizada via fonte alternativa. Alguns dados podem estar incompletos.");
      } else {
        msgs.push("Encontramos menos leads que o solicitado. O Google Maps pode não ter mais resultados para esse nicho nessa região.");
      }
    } else if (buscaSource === "serpapi") {
      msgs.push("Busca realizada via fonte alternativa. Alguns dados podem estar incompletos.");
    }

    return msgs;
  }, [resultados, totalBruto, totalBrutoFonte, buscaSource, maxResultados, loading]);


  const salvarBusca = () => {
    if (plano.monitoramento <= 0) {
      setUpgradeMsg({ t: "Monitoramento é Pro", d: "Salve buscas e seja notificado quando novos negócios aparecerem no Google Maps." });
      setUpgradeOpen(true); return;
    }
    if (buscasSalvas.length >= plano.monitoramento) {
      setUpgradeMsg({ t: "Limite de monitoramentos", d: `Seu plano permite ${plano.monitoramento} buscas salvas. Faça upgrade para mais.` });
      setUpgradeOpen(true); return;
    }
    addBuscaSalva({ nicho, cidade, raio, semSite, avaliacaoMin });
    toast.success("Busca salva ✓");
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader title="Buscar leads" subtitle="Encontre negócios no Google Maps prontos para serem abordados" />

      {limiteAtingido && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm flex items-center justify-between gap-3">
          <span>Você atingiu o limite de {plano.buscas_mes} buscas do plano {plano.nome}.</span>
          <Button size="sm" onClick={() => { setUpgradeMsg({ t: "Mais buscas", d: "Faça upgrade para liberar mais buscas." }); setUpgradeOpen(true); }}>Fazer upgrade</Button>
        </div>
      )}

      {buscasRecentes.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Buscas recentes
          </div>
          <div className="flex flex-wrap gap-1.5">
            {buscasRecentes.map((b) => {
              const key = `${b.nicho.toLowerCase().trim()}|${b.cidade.toLowerCase().trim()}`;
              return (
                <div
                  key={key}
                  className="group inline-flex items-center gap-1 rounded-full border border-border bg-background pl-3 pr-1 py-0.5 text-xs hover:border-primary/40 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => { setNicho(b.nicho); setCidade(b.cidade); }}
                    className="inline-flex items-center gap-1.5"
                  >
                    <span className="font-medium">{b.nicho}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{b.cidade}</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Remover busca recente"
                    onClick={() => removerBuscaRecente(key)}
                    className="grid place-items-center h-5 w-5 rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}


      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2 md:col-span-1">
            <Label>Nicho / tipo de negócio</Label>
            <NichoCombobox value={nicho} onChange={setNicho} onEnter={buscar} />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label>Cidade ou bairro</Label>
            <CidadeCombobox value={cidade} onChange={setCidade} onEnter={buscar} />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label>Raio de busca: <span className="text-primary font-medium">{raio}km</span></Label>
            <input type="range" min={1} max={100} value={raio} onChange={(e) => setRaio(Number(e.target.value))} className="w-full accent-[color:var(--color-primary)]" />
          </div>
        </div>

        <button type="button" onClick={() => setAdvOpen((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          {advOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Filtros avançados
        </button>
        {advOpen && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-border">
            <label className="flex items-center gap-2 text-sm pt-6">
              <input type="checkbox" checked={semSite} onChange={(e) => setSemSite(e.target.checked)} />
              Apenas negócios SEM site
            </label>
            <div className="space-y-2">
              <Label>Avaliação mínima</Label>
              <select className="h-10 w-full rounded-md bg-input border border-border px-3 text-sm" value={avaliacaoMin} onChange={(e) => setAvaliacaoMin(Number(e.target.value))}>
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? "Sem mínimo" : `${n}★ ou mais`}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Máximo de resultados</Label>
              <select className="h-10 w-full rounded-md bg-input border border-border px-3 text-sm" value={maxResultados} onChange={(e) => setMaxResultados(Number(e.target.value))}>
                {(plano.id === "dono" ? [5, 10, 15, 20, 30, 50, 100] : [5, 10, 15, 20]).map((n) => <option key={n} value={n}>{n} resultados</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={buscar} disabled={loading} size="lg" className="bg-gradient-primary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            {loading ? "Buscando..." : "Buscar leads"}
          </Button>
        </div>
      </div>

      {loading && (
        <>
          <BuscarLoading
            cidade={cidade.trim() || "sua região"}
            nicho={nicho.trim() || "negócios"}
            maxResultados={maxResultados}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {Array.from({ length: Math.min(6, maxResultados) }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-5 space-y-3 animate-pulse"
              >
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
                <div className="h-3 w-full rounded bg-muted" />
                <div className="flex gap-2 pt-2">
                  <div className="h-6 w-16 rounded-full bg-muted" />
                  <div className="h-6 w-12 rounded-full bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && resultados && resultadosOrdenados && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">{resultadosOrdenados.length} leads</span>{" "}
              {resultadosOrdenados.length !== resultados.length && <span>de {resultados.length} </span>}
              em {tempo.toFixed(2)}s ·{" "}
              <span className="text-destructive">🔥 {contagens.quentes}</span>{" "}
              <span className="text-warning">⚡ {contagens.mornos}</span>{" "}
              <span className="text-muted-foreground">❄️ {contagens.frios}</span>
              {filtradosCount > 0 && (
                <span className="ml-2 text-xs text-muted-foreground/80">
                  · {filtradosCount} já no CRM ocultado{filtradosCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={salvarBusca}><Save className="h-4 w-4" /> Salvar busca</Button>
              <ExportButton leads={resultadosOrdenados} filename={`leads-${nicho}.csv`} />
            </div>
          </div>

          {mensagensAviso.length > 0 && (
            <div className="mb-3 space-y-2">
              {mensagensAviso.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground/80">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
            <span className="text-muted-foreground">Ordenar:</span>
            {([
              { id: "score", label: "Score" },
              { id: "avaliacao", label: "Avaliação" },
              { id: "nome", label: "Nome" },
            ] as const).map((o) => (
              <button
                key={o.id}
                onClick={() => setOrdenacao(o.id)}
                className={`px-2 py-0.5 rounded-md border transition-colors ${ordenacao === o.id ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground hover:text-foreground"}`}
              >{o.label}</button>
            ))}
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Nível:</span>
            {([
              { id: "todos", label: "Todos" },
              { id: "QUENTE", label: "🔥 Quente" },
              { id: "MORNO", label: "⚡ Morno" },
              { id: "FRIO", label: "❄️ Frio" },
            ] as const).map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltroNivel(f.id)}
                className={`px-2 py-0.5 rounded-md border transition-colors ${filtroNivel === f.id ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground hover:text-foreground"}`}
              >{f.label}</button>
            ))}
          </div>

          {resultadosOrdenados.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
              Nenhum lead encontrado. Tente ajustar os filtros.
            </div>
          ) : (() => {
            const FREE_LIMIT = 6;
            const isFree = plano.id === "free";
            const visiveis = isFree ? resultadosOrdenados.slice(0, FREE_LIMIT) : resultadosOrdenados;
            const bloqueados = isFree ? resultadosOrdenados.slice(FREE_LIMIT) : [];
            return (
              <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visiveis.map((l) => <LeadCard key={l.id} lead={l} />)}
                </div>
                {bloqueados.length > 0 && (
                  <div className="relative mt-6">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pointer-events-none select-none" style={{ filter: "blur(6px)", opacity: 0.55 }} aria-hidden>
                      {bloqueados.slice(0, 6).map((l) => <LeadCard key={l.id} lead={l} />)}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      <div className="rounded-2xl border border-primary/40 bg-card/95 backdrop-blur-sm p-6 max-w-md text-center shadow-2xl">
                        <div className="mx-auto mb-3 grid place-items-center h-12 w-12 rounded-full bg-primary/15 text-primary">
                          <Lock className="h-5 w-5" />
                        </div>
                        <h3 className="font-display font-semibold text-lg mb-1">
                          +{bloqueados.length} leads bloqueados
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          O plano <strong>Free</strong> mostra apenas {FREE_LIMIT} leads por busca. Faça upgrade para o Pro e desbloqueie todos.
                        </p>
                        <Button asChild className="w-full bg-gradient-primary">
                          <Link to="/planos"><Sparkles className="h-4 w-4" /> Desbloquear todos</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {!loading && !resultados && (
        <div className="rounded-xl border border-solid border-border bg-card/40 p-12 text-center text-muted-foreground">
          <Radar className="h-10 w-10 mx-auto mb-3 text-primary/50" />
          <p className="font-medium text-foreground mb-1">Pronto para prospectar?</p>
          <p className="text-sm">Informe um nicho e cidade para encontrar leads no Google Maps.</p>
        </div>
      )}

      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} titulo={upgradeMsg.t} descricao={upgradeMsg.d} />
    </div>
  );
}
