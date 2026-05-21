import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Sparkles, Users, MessageSquare, Calendar, Rocket, Zap, Lock, Check, Loader2, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { UpgradeModal } from "@/components/upgrade-modal";
import { useStore, usePlano, type CampanhaItem } from "@/store/app-store";
import { calcularScoreObjetivo, classificar, SCORE_CORES } from "@/lib/lead-score";
import { gerarConfigCampanhaIA, type CampanhaConfigIA, type EtapaConfig } from "@/lib/campanha-ia.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/campanhas/nova")({
  head: () => ({ meta: [{ title: "Nova campanha — Modo Campanha" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: WizardPage,
});

const NICHOS_SUGERIDOS = [
  { emoji: "🦷", label: "Clínicas odontológicas" },
  { emoji: "🍽️", label: "Restaurantes" },
  { emoji: "🐾", label: "Pet Shops" },
  { emoji: "💄", label: "Salões de beleza" },
  { emoji: "🏋️", label: "Academias" },
  { emoji: "⚖️", label: "Advogados" },
  { emoji: "🏠", label: "Imobiliárias" },
  { emoji: "🔧", label: "Oficinas" },
  { emoji: "📸", label: "Fotógrafos" },
];

const OBJETIVOS = [
  { id: "reuniao", label: "Agendar reunião / ligação" },
  { id: "vender_site", label: "Vender site ou landing page" },
  { id: "vender_automacao", label: "Vender automação WhatsApp" },
  { id: "vender_social", label: "Vender gestão de redes sociais" },
  { id: "prospectar", label: "Apenas prospectar e qualificar" },
] as const;

type Objetivo = (typeof OBJETIVOS)[number]["id"];

function WizardPage() {
  const plano = usePlano();
  const navigate = useNavigate();
  const { leads, templates, createCampanha } = useStore();

  // Plan gate
  const [upgradeOpen, setUpgradeOpen] = useState(plano.id === "free");

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Passo 1
  const [nicho, setNicho] = useState("");
  const [cidade, setCidade] = useState("");
  const [quantidade, setQuantidade] = useState<number>(50);
  const [objetivo, setObjetivo] = useState<Objetivo>("vender_site");
  const [apenasSemSite, setApenasSemSite] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Configuração gerada
  const [config, setConfig] = useState<CampanhaConfigIA | null>(null);
  const [horarioInicio, setHorarioInicio] = useState<string>("");
  const [intervaloSeg, setIntervaloSeg] = useState<number>(45);
  const [removidos, setRemovidos] = useState<Set<string>>(new Set());

  const gerarFn = useServerFn(gerarConfigCampanhaIA);
  const gerarMut = useMutation({
    mutationFn: gerarFn,
    onSuccess: (data) => {
      setConfig(data);
      setHorarioInicio(proximaJanela(data.horarioIdeal));
      setStep(2);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao montar campanha"),
  });

  // Filtra leads do CRM por nicho/cidade + ordena por score
  const leadsSelecionados = useMemo(() => {
    if (!nicho || !cidade) return [];
    const filtrados = leads
      .filter((l) => {
        const matchNicho = l.nicho?.toLowerCase().includes(nicho.toLowerCase()) || l.categoria?.toLowerCase?.().includes(nicho.toLowerCase());
        const matchCidade = l.cidade?.toLowerCase().includes(cidade.toLowerCase());
        if (!matchNicho || !matchCidade) return false;
        if (apenasSemSite && l.site) return false;
        return true;
      })
      .map((l) => ({ lead: l, score: calcularScoreObjetivo(l).scoreObjetivo }))
      .sort((a, b) => b.score - a.score)
      .slice(0, quantidade);
    return filtrados;
  }, [leads, nicho, cidade, quantidade, apenasSemSite]);

  const semSitePct = leadsSelecionados.length
    ? (leadsSelecionados.filter((x) => !x.lead.site).length / leadsSelecionados.length) * 100
    : 0;

  const finais = useMemo(
    () => leadsSelecionados.filter((x) => !removidos.has(x.lead.id)),
    [leadsSelecionados, removidos],
  );

  const handleMontar = () => {
    if (!nicho.trim()) return toast.error("Informe o nicho");
    if (!cidade.trim()) return toast.error("Informe a cidade");
    if (leadsSelecionados.length === 0) {
      return toast.error("Nenhum lead encontrado no seu CRM. Faça uma busca primeiro em Buscar leads.");
    }
    gerarMut.mutate({ data: { nicho, cidade, quantidade, objetivo, semSitePct } });
  };

  const handleLancar = () => {
    if (!config) return;
    if (finais.length === 0) return toast.error("Selecione ao menos 1 lead");
    const tplFallback = templates[0];
    if (!tplFallback) return toast.error("Nenhum template disponível");
    const items: CampanhaItem[] = finais.map((x) => ({ leadId: x.lead.id, status: "pendente" as const }));
    const agendamento = horarioInicio ? new Date(horarioInicio).getTime() : undefined;
    const limitePorHora = Math.max(1, Math.round(3600 / Math.max(1, intervaloSeg)));

    createCampanha({
      nome: config.nomeCampanha,
      templateId: tplFallback.id,
      mensagemOverride: config.sequencia[0]?.mensagem ?? "",
      filtroNicho: nicho,
      filtroCidade: cidade,
      apenasSemSite,
      apenasStatusNovo: false,
      limitePorHora,
      agendamento,
      items,
    });
    toast.success(`Campanha "${config.nomeCampanha}" criada com ${finais.length} leads!`);
    navigate({ to: "/app/campanhas" });
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 pt-16 md:pt-10 max-w-5xl mx-auto">
      <PageHeader title="Modo Campanha" subtitle="De ideia a campanha rodando em 3 cliques.">
        <Button asChild variant="ghost">
          <Link to="/app/campanhas"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        </Button>
      </PageHeader>

      <StepIndicator step={step} />

      {gerarMut.isPending && <LoadingMontagem nicho={nicho} cidade={cidade} />}

      {!gerarMut.isPending && step === 1 && (
        <Passo1
          nicho={nicho} setNicho={setNicho}
          cidade={cidade} setCidade={setCidade}
          quantidade={quantidade} setQuantidade={setQuantidade}
          objetivo={objetivo} setObjetivo={setObjetivo}
          apenasSemSite={apenasSemSite} setApenasSemSite={setApenasSemSite}
          mostrarFiltros={mostrarFiltros} setMostrarFiltros={setMostrarFiltros}
          leadsEncontrados={leadsSelecionados.length}
          onMontar={handleMontar}
          isPending={gerarMut.isPending}
        />
      )}

      {!gerarMut.isPending && step === 2 && config && (
        <Passo2
          config={config}
          setConfig={setConfig}
          leadsSelecionados={finais}
          totalLeads={leadsSelecionados.length}
          removidos={removidos}
          toggleRemovido={(id) => {
            setRemovidos((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            });
          }}
          horarioInicio={horarioInicio}
          setHorarioInicio={setHorarioInicio}
          intervaloSeg={intervaloSeg}
          setIntervaloSeg={setIntervaloSeg}
          onVoltar={() => setStep(1)}
          onAvancar={() => setStep(3)}
        />
      )}

      {!gerarMut.isPending && step === 3 && config && (
        <Passo3
          config={config}
          totalFinais={finais.length}
          horarioInicio={horarioInicio}
          onVoltar={() => setStep(2)}
          onLancar={handleLancar}
        />
      )}

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={(o) => {
          setUpgradeOpen(o);
          if (!o && plano.id === "free") navigate({ to: "/app/campanhas" });
        }}
        titulo="Modo Campanha — exclusivo Pro"
        descricao="Prospecte um nicho inteiro de uma vez. A IA monta a lista, escreve as mensagens e agenda tudo automaticamente."
      />
    </div>
  );
}

function proximaJanela(horarioIdeal: string): string {
  const [h, m] = horarioIdeal.split(":").map((x) => parseInt(x, 10));
  const d = new Date();
  d.setSeconds(0, 0);
  d.setHours(isNaN(h) ? 9 : h, isNaN(m) ? 0 : m);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  // formato datetime-local
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Definir alvo" },
    { n: 2, label: "Revisar campanha" },
    { n: 3, label: "Confirmar e lançar" },
  ];
  return (
    <div className="flex items-center gap-2 sm:gap-4 mb-6 overflow-x-auto">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className={cn(
            "grid place-items-center h-8 w-8 rounded-full text-xs font-bold transition-colors",
            step === s.n ? "bg-primary text-primary-foreground" :
            step > s.n ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
          )}>
            {step > s.n ? <Check className="h-4 w-4" /> : s.n}
          </div>
          <span className={cn("text-sm whitespace-nowrap", step === s.n ? "font-semibold" : "text-muted-foreground")}>
            {s.label}
          </span>
          {i < steps.length - 1 && <div className="h-px w-6 sm:w-12 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function LoadingMontagem({ nicho, cidade }: { nicho: string; cidade: string }) {
  const steps = [
    `🔍 Buscando ${nicho || "leads"} em ${cidade || "sua cidade"}...`,
    "✓ Leads encontrados e pontuados",
    "⚡ Selecionando os mais quentes...",
    "✍️ Escolhendo melhor template...",
    "📅 Montando sequência de follow-up...",
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-10">
      <div className="flex items-center gap-3 mb-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div className="font-semibold">Montando sua campanha com IA...</div>
      </div>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="text-sm text-muted-foreground animate-in fade-in slide-in-from-left-2" style={{ animationDelay: `${i * 600}ms`, animationFillMode: "backwards" }}>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

function Passo1(props: {
  nicho: string; setNicho: (v: string) => void;
  cidade: string; setCidade: (v: string) => void;
  quantidade: number; setQuantidade: (v: number) => void;
  objetivo: Objetivo; setObjetivo: (v: Objetivo) => void;
  apenasSemSite: boolean; setApenasSemSite: (v: boolean) => void;
  mostrarFiltros: boolean; setMostrarFiltros: (v: boolean) => void;
  leadsEncontrados: number;
  onMontar: () => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-6">
      <h2 className="text-lg font-semibold">Para quem é esta campanha?</h2>

      <div className="space-y-2">
        <Label>Nicho / tipo de negócio</Label>
        <Input
          value={props.nicho}
          onChange={(e) => props.setNicho(e.target.value)}
          placeholder="Ex: clínicas odontológicas"
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {NICHOS_SUGERIDOS.map((n) => (
            <button
              key={n.label}
              type="button"
              onClick={() => props.setNicho(n.label)}
              className="text-xs rounded-full border border-border bg-background px-3 py-1.5 hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              {n.emoji} {n.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Cidade</Label>
        <Input value={props.cidade} onChange={(e) => props.setCidade(e.target.value)} placeholder="Ex: São Paulo - SP" />
      </div>

      <div className="space-y-2">
        <Label>Quantos leads prospectar?</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[20, 50, 100].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => props.setQuantidade(q)}
              className={cn(
                "rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors",
                props.quantidade === q ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40",
              )}
            >
              {q} leads
            </button>
          ))}
          <Input
            type="number" min={1} max={500}
            value={props.quantidade}
            onChange={(e) => props.setQuantidade(Math.max(1, Math.min(500, Number(e.target.value) || 0)))}
            placeholder="Personalizar"
            className="h-auto py-3"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Objetivo da campanha</Label>
        <div className="grid sm:grid-cols-2 gap-2">
          {OBJETIVOS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => props.setObjetivo(o.id)}
              className={cn(
                "rounded-lg border-2 px-4 py-3 text-sm text-left transition-colors",
                props.objetivo === o.id ? "border-primary bg-primary/5 text-primary font-medium" : "border-border hover:border-primary/40",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={() => props.setMostrarFiltros(!props.mostrarFiltros)}
        >
          {props.mostrarFiltros ? "− Ocultar filtros" : "+ Mostrar filtros opcionais"}
        </button>
        {props.mostrarFiltros && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-border p-3">
            <div className="text-sm">Apenas negócios sem site</div>
            <Switch checked={props.apenasSemSite} onCheckedChange={props.setApenasSemSite} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="text-xs text-muted-foreground">
          {props.leadsEncontrados > 0
            ? <><Users className="inline h-3 w-3 mr-1" /> {props.leadsEncontrados} leads compatíveis no seu CRM</>
            : "Os leads são puxados do seu CRM — faça uma busca antes para popular."}
        </div>
        <Button onClick={props.onMontar} disabled={props.isPending} size="lg">
          <Sparkles className="h-4 w-4" /> Montar com IA <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Passo2(props: {
  config: CampanhaConfigIA;
  setConfig: (c: CampanhaConfigIA) => void;
  leadsSelecionados: { lead: any; score: number }[];
  totalLeads: number;
  removidos: Set<string>;
  toggleRemovido: (id: string) => void;
  horarioInicio: string;
  setHorarioInicio: (v: string) => void;
  intervaloSeg: number;
  setIntervaloSeg: (v: number) => void;
  onVoltar: () => void;
  onAvancar: () => void;
}) {
  const { config } = props;
  const [editandoSeq, setEditandoSeq] = useState(false);
  const [verTodos, setVerTodos] = useState(false);
  const duracaoDias = config.sequencia.reduce((acc, e) => acc + (e.unidade === "dias" ? e.intervalo : e.intervalo / 24), 0);

  const updateMensagem = (ordem: number, mensagem: string) => {
    props.setConfig({
      ...config,
      sequencia: config.sequencia.map((e) => e.ordem === ordem ? { ...e, mensagem } : e),
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold">📋 {config.nomeCampanha}</h2>
            <p className="text-sm text-muted-foreground mt-1">Sua campanha está pronta para revisão.</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat label="leads quentes" value={`${props.leadsSelecionados.length}`} icon={Users} />
          <Stat label="etapas" value={`${config.sequencia.length}`} icon={MessageSquare} />
          <Stat label="duração" value={`~${Math.round(duracaoDias)} dias`} icon={Calendar} />
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <span className="font-semibold">💡 Dica da IA: </span>
          {config.dicaCampanha}
        </div>
      </div>

      {/* Leads */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Leads selecionados ({props.leadsSelecionados.length})</h3>
          <Button size="sm" variant="ghost" onClick={() => setVerTodos(!verTodos)}>
            {verTodos ? "Ver menos" : `Ver todos os ${props.totalLeads}`}
          </Button>
        </div>
        <div className="space-y-1.5">
          {(verTodos ? props.leadsSelecionados : props.leadsSelecionados.slice(0, 5)).map(({ lead, score }) => {
            const cls = classificar(score);
            const cores = SCORE_CORES[cls];
            return (
              <div key={lead.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div className="min-w-0 flex-1 truncate">
                  <span className="mr-2">{cores.emoji}</span>
                  <span className="font-medium">{lead.nome}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    Score {score}{!lead.site && " · Sem site"}
                  </span>
                </div>
                {verTodos && (
                  <button
                    type="button"
                    onClick={() => props.toggleRemovido(lead.id)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remover
                  </button>
                )}
              </div>
            );
          })}
          {!verTodos && props.leadsSelecionados.length > 5 && (
            <p className="text-xs text-muted-foreground pl-2">... e mais {props.leadsSelecionados.length - 5} leads</p>
          )}
        </div>
      </div>

      {/* Sequência */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Sequência de mensagens</h3>
          <Button size="sm" variant="ghost" onClick={() => setEditandoSeq(!editandoSeq)}>
            <Pencil className="h-3 w-3" /> {editandoSeq ? "Pronto" : "Editar"}
          </Button>
        </div>
        <div className="space-y-3">
          {config.sequencia.map((etapa, i) => (
            <div key={etapa.ordem}>
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline">Etapa {etapa.ordem}</Badge>
                <span className="text-xs text-muted-foreground">
                  {etapa.intervalo === 0 ? "Envio imediato" : `Após ${etapa.intervalo} ${etapa.unidade}`}
                </span>
              </div>
              {editandoSeq ? (
                <Textarea
                  rows={3}
                  value={etapa.mensagem}
                  onChange={(e) => updateMensagem(etapa.ordem, e.target.value)}
                />
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                  {etapa.mensagem}
                </div>
              )}
              {i < config.sequencia.length - 1 && (
                <div className="text-center text-xs text-muted-foreground mt-2">↓ aguardar {config.sequencia[i + 1].intervalo} {config.sequencia[i + 1].unidade}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Cronograma */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-semibold mb-3">Cronograma de disparos</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Início</Label>
            <Input type="datetime-local" value={props.horarioInicio} onChange={(e) => props.setHorarioInicio(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Horário ideal sugerido pela IA: {config.horarioIdeal}</p>
          </div>
          <div className="space-y-2">
            <Label>Intervalo entre disparos (segundos)</Label>
            <Input
              type="number" min={5} max={600}
              value={props.intervaloSeg}
              onChange={(e) => props.setIntervaloSeg(Math.max(5, Math.min(600, Number(e.target.value) || 45)))}
            />
            <p className="text-[11px] text-muted-foreground">≈ {Math.round(3600 / props.intervaloSeg)} mensagens por hora</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={props.onVoltar}><ArrowLeft className="h-4 w-4" /> Ajustar</Button>
        <Button onClick={props.onAvancar} size="lg">
          Continuar <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <Icon className="h-4 w-4 text-primary mx-auto mb-1" />
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Passo3(props: {
  config: CampanhaConfigIA;
  totalFinais: number;
  horarioInicio: string;
  onVoltar: () => void;
  onLancar: () => void;
}) {
  const inicio = props.horarioInicio ? new Date(props.horarioInicio).toLocaleString("pt-BR") : "imediato";
  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-card p-6 sm:p-8 space-y-6">
      <div className="text-center">
        <Rocket className="h-12 w-12 text-primary mx-auto mb-3" />
        <h2 className="text-2xl font-bold">Tudo pronto para lançar 🚀</h2>
        <p className="text-muted-foreground mt-1">{props.config.nomeCampanha}</p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-2">
        <div className="text-sm font-semibold mb-2">Resumo final:</div>
        {[
          `${props.totalFinais} leads selecionados por score`,
          `${props.config.sequencia.length} mensagens personalizadas para o nicho`,
          `Início: ${inicio}`,
          "Pausa automática quando o lead responder",
        ].map((line) => (
          <div key={line} className="flex items-start gap-2 text-sm">
            <Check className="h-4 w-4 text-success shrink-0 mt-0.5" /> {line}
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-xs text-warning-foreground">
        ⚠️ Etapa 1 da sequência será disparada via Campanhas. As etapas seguintes podem ser gerenciadas na seção <Link to="/app/sequencias" className="underline font-medium">Sequências</Link>.
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={props.onVoltar}><ArrowLeft className="h-4 w-4" /> Revisar</Button>
        <Button onClick={props.onLancar} size="lg" className="bg-gradient-primary">
          <Rocket className="h-4 w-4" /> Lançar campanha agora
        </Button>
      </div>
    </div>
  );
}
