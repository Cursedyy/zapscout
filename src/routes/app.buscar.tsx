import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Radar, Save, ChevronDown, ChevronUp, Loader2, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { LeadCard } from "@/components/lead-card";
import { ExportButton } from "@/components/export-button";
import { UpgradeModal } from "@/components/upgrade-modal";
import { MOCK_LEADS, type MockLead } from "@/data/mock-leads";
import { usePlano, useStore } from "@/store/app-store";
import { toast } from "sonner";

export const Route = createFileRoute("/app/buscar")({
  head: () => ({ meta: [{ title: "Buscar leads — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: BuscarPage,
});

const LOADING_STEPS = ["Escaneando o mapa...", "Encontrando negócios...", "Quase lá..."];

function BuscarPage() {
  const plano = usePlano();
  const { buscasUsadas, incrementarBusca, addBuscaSalva, buscasSalvas } = useStore();
  const [nicho, setNicho] = useState("");
  const [cidade, setCidade] = useState("São Paulo - SP");
  const [raio, setRaio] = useState(5);
  const [advOpen, setAdvOpen] = useState(false);
  const [semSite, setSemSite] = useState(false);
  const [avaliacaoMin, setAvaliacaoMin] = useState(0);
  const [maxResultados, setMaxResultados] = useState(50);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [resultados, setResultados] = useState<MockLead[] | null>(null);
  const [tempo, setTempo] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState({ t: "", d: "" });

  const limiteAtingido = buscasUsadas >= plano.buscas_mes;

  const buscar = async () => {
    if (!nicho.trim()) { toast.error("Informe o nicho"); return; }
    if (limiteAtingido) {
      setUpgradeMsg({ t: "Limite de buscas atingido", d: `Você usou todas as ${plano.buscas_mes} buscas do seu plano ${plano.nome}.` });
      setUpgradeOpen(true);
      return;
    }
    setLoading(true);
    setResultados(null);
    setLoadingStep(0);
    const start = performance.now();
    const stepInt = setInterval(() => setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 500);
    await new Promise((r) => setTimeout(r, 1500));
    clearInterval(stepInt);

    // TODO: Integrar Google Places API
    const n = nicho.toLowerCase().trim();
    const c = cidade.toLowerCase().trim();
    let filtrados = MOCK_LEADS.filter((l) => {
      const matchNicho = !n || l.nicho.toLowerCase().includes(n) || n.split(" ").some((w) => w.length > 3 && l.nicho.toLowerCase().includes(w));
      const matchCidade = !c || l.cidade.toLowerCase().includes(c.split(" - ")[0] ?? c) || c.includes(l.cidade.toLowerCase().split(" - ")[0] ?? "");
      const matchSite = !semSite || !l.site;
      const matchAval = l.avaliacao >= avaliacaoMin;
      return matchNicho && matchCidade && matchSite && matchAval;
    }).slice(0, maxResultados);

    if (filtrados.length === 0) filtrados = MOCK_LEADS.filter((l) => (!semSite || !l.site) && l.avaliacao >= avaliacaoMin).slice(0, Math.min(8, maxResultados));

    setResultados(filtrados);
    setTempo((performance.now() - start) / 1000);
    setLoading(false);
    incrementarBusca();
  };

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
    <div className="p-4 sm:p-6 md:p-10 pt-16 md:pt-10 max-w-7xl mx-auto">
      <PageHeader title="Buscar leads" subtitle="Encontre negócios no Google Maps prontos para serem abordados" />

      {limiteAtingido && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm flex items-center justify-between gap-3">
          <span>Você atingiu o limite de {plano.buscas_mes} buscas do plano {plano.nome}.</span>
          <Button size="sm" onClick={() => { setUpgradeMsg({ t: "Mais buscas", d: "Faça upgrade para liberar mais buscas." }); setUpgradeOpen(true); }}>Fazer upgrade</Button>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2 md:col-span-1">
            <Label>Nicho / tipo de negócio</Label>
            <Input placeholder="ex: clínica odontológica" value={nicho} onChange={(e) => setNicho(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label>Cidade ou bairro</Label>
            <Input placeholder="ex: São Paulo - SP" value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label>Raio de busca: <span className="text-primary font-medium">{raio}km</span></Label>
            <input type="range" min={1} max={20} value={raio} onChange={(e) => setRaio(Number(e.target.value))} className="w-full accent-[color:var(--color-primary)]" />
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
                {[20, 50, 100].map((n) => <option key={n} value={n}>{n} resultados</option>)}
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
        <div className="space-y-4">
          <div className="text-center text-sm text-muted-foreground animate-pulse">{LOADING_STEPS[loadingStep]}</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
                <Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && resultados && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">{resultados.length} leads</span> encontrados em {tempo.toFixed(2)}s
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={salvarBusca}><Save className="h-4 w-4" /> Salvar busca</Button>
              <ExportButton leads={resultados} filename={`leads-${nicho}.csv`} />
            </div>
          </div>
          {resultados.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
              Nenhum lead encontrado. Tente ajustar os filtros.
            </div>
          ) : (() => {
            const FREE_LIMIT = 6;
            const isFree = plano.id === "free";
            const visiveis = isFree ? resultados.slice(0, FREE_LIMIT) : resultados;
            const bloqueados = isFree ? resultados.slice(FREE_LIMIT) : [];
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
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-muted-foreground">
          <Radar className="h-10 w-10 mx-auto mb-3 text-primary/50" />
          <p className="font-medium text-foreground mb-1">Pronto para prospectar?</p>
          <p className="text-sm">Informe um nicho e cidade para encontrar leads no Google Maps.</p>
        </div>
      )}

      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} titulo={upgradeMsg.t} descricao={upgradeMsg.d} />
    </div>
  );
}
