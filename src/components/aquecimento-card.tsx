import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Flame,
  AlertTriangle,
  Loader2,
  Save,
  Plus,
  Trash2,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  listAquecimentoChips,
  upsertAquecimentoChip,
  deleteAquecimentoChip,
  toggleAquecimentoChip,
  getHistorico7Dias,
} from "@/lib/aquecimento.functions";
import {
  metaDiaria,
  INTENSIDADE_RANGE,
  DIAS_SEMANA_LABEL,
  DIAS_SEMANA_NOME,
  getLimitesAquecimento,
  type Intensidade,
  type TipoMensagem,
} from "@/lib/aquecimento-shared";
import { UpgradeModal } from "@/components/upgrade-modal";


const DURACOES = [7, 14, 30] as const;
const INTENSIDADES: { id: Intensidade; label: string; desc: string }[] = [
  { id: "suave", label: "Suave", desc: "5–15 msgs/dia" },
  { id: "moderado", label: "Moderado", desc: "15–30 msgs/dia" },
  { id: "agressivo", label: "Agressivo", desc: "30–50 msgs/dia" },
];
const TIPOS: { id: TipoMensagem; label: string }[] = [
  { id: "casual", label: "Casual" },
  { id: "profissional", label: "Profissional" },
  { id: "misto", label: "Misto" },
];


type Chip = {
  id: string;
  nome: string | null;
  ativo: boolean;
  status: string;
  numero_destino: string | null;
  duracao_dias: number;
  intensidade: string;
  tipo_mensagem: string;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: number[];
  iniciado_em: string | null;
  mensagens_hoje: number;
  total_enviadas: number;
  ultimo_erro: string | null;
};

const NOVO_CHIP: Omit<Chip, "id"> = {
  nome: "",
  ativo: false,
  status: "pausado",
  numero_destino: "",
  duracao_dias: 14,
  intensidade: "moderado",
  tipo_mensagem: "misto",
  horario_inicio: "08:00",
  horario_fim: "20:00",
  dias_semana: [1, 2, 3, 4, 5],
  iniciado_em: null,
  mensagens_hoje: 0,
  total_enviadas: 0,
  ultimo_erro: null,
};

export function AquecimentoCard({ connected }: { connected: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAquecimentoChips);
  const histFn = useServerFn(getHistorico7Dias);
  const { user } = useAuth();

  const { data: chips } = useQuery({
    queryKey: ["aquecimento-chips"],
    queryFn: () => listFn(),
    refetchInterval: 15000,
  });
  const { data: historico } = useQuery({
    queryKey: ["aquecimento-historico"],
    queryFn: () => histFn(),
    refetchInterval: 30000,
  });
  const { data: profile } = useQuery({
    queryKey: ["profile-plano"],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("plano")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const [draftNovo, setDraftNovo] = useState(false);

  const plano = (profile?.plano ?? "free") as "free" | "pro" | "agencia" | "business";
  const LIMITE_POR_PLANO: Record<string, number> = {
    free: 0,
    pro: 1,
    agencia: 3,
    business: 5,
  };
  const limiteChips = LIMITE_POR_PLANO[plano] ?? 0;
  const atingiuLimite = (chips?.length ?? 0) >= limiteChips;

  const handleAdicionar = () => {
    if (plano === "free") {
      toast.error("Upgrade necessário para usar aquecimento");
      return;
    }
    if (atingiuLimite) {
      toast.error(
        `Limite de ${limiteChips} chip${limiteChips > 1 ? "s" : ""} atingido para o plano ${plano}`
      );
      return;
    }
    setDraftNovo(true);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="grid place-items-center h-10 w-10 rounded-xl bg-orange-500/15 text-orange-500 shrink-0">
          <Flame className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold">Aquecimento de número</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Envia mensagens variadas em volume crescente para simular uso natural e preservar
            a reputação do seu número. Até {limiteChips} chip{limiteChips !== 1 ? "s" : ""} no seu plano.
          </p>
        </div>
      </div>

      {!connected && (
        <div className="text-xs text-muted-foreground rounded-lg bg-muted/40 border border-border p-3">
          Conecte um WhatsApp primeiro para habilitar o aquecimento.
        </div>
      )}

      {plano === "free" && (
        <div className="text-xs rounded-lg border border-primary/40 bg-primary/10 p-3 text-primary">
          <strong>Funcionalidade exclusiva dos planos pagos.</strong> Faça upgrade para liberar o aquecimento de número.
        </div>
      )}

      <div className="flex items-start gap-2 text-xs rounded-lg border border-warning/40 bg-warning/10 p-3 text-warning">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>Use números secundários como destino.</strong> Nunca use o número
          principal do seu cliente — as mensagens são automáticas e em alto volume.
        </span>
      </div>

      <div className="space-y-3">
        {(chips ?? []).map((c) => (
          <ChipEditor
            key={c.id}
            chip={c as Chip}
            connected={connected}
            historico={historico?.[c.id] ?? {}}
            onChanged={() => {
              qc.invalidateQueries({ queryKey: ["aquecimento-chips"] });
              qc.invalidateQueries({ queryKey: ["aquecimento-historico"] });
            }}
          />
        ))}

        {draftNovo && (
          <ChipEditor
            chip={{ id: "", ...NOVO_CHIP }}
            connected={connected}
            isNovo
            historico={{}}
            onChanged={() => {
              setDraftNovo(false);
              qc.invalidateQueries({ queryKey: ["aquecimento-chips"] });
            }}
            onCancel={() => setDraftNovo(false)}
          />
        )}
      </div>

      <div className="flex justify-between items-center text-xs text-muted-foreground">
        <span>
          {chips?.length ?? 0} / {limiteChips} chips
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!connected || atingiuLimite || draftNovo || plano === "free"}
          onClick={handleAdicionar}
        >
          <Plus className="h-4 w-4 mr-2" /> Adicionar chip
        </Button>
      </div>
    </div>
  );
}

function ChipEditor({
  chip,
  connected,
  historico,
  isNovo,
  onChanged,
  onCancel,
}: {
  chip: Chip;
  connected: boolean;
  historico: Record<string, number>;
  isNovo?: boolean;
  onChanged: () => void;
  onCancel?: () => void;
}) {
  const saveFn = useServerFn(upsertAquecimentoChip);
  const delFn = useServerFn(deleteAquecimentoChip);
  const toggleFn = useServerFn(toggleAquecimentoChip);

  const [form, setForm] = useState<Chip>(chip);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(chip), [form, chip]);

  useEffect(() => {
    setForm(chip);
  }, [chip]);

  const diaAtual = (() => {
    if (!chip.iniciado_em || !chip.ativo) return 0;
    const diff = Date.now() - new Date(chip.iniciado_em).getTime();
    return Math.min(chip.duracao_dias, Math.floor(diff / (24 * 60 * 60 * 1000)) + 1);
  })();
  const meta =
    chip.ativo && diaAtual > 0
      ? metaDiaria(diaAtual, chip.duracao_dias, chip.intensidade as Intensidade)
      : 0;
  const progresso = chip.ativo && chip.duracao_dias ? (diaAtual / chip.duracao_dias) * 100 : 0;
  const estimativaFim = chip.iniciado_em
    ? new Date(new Date(chip.iniciado_em).getTime() + chip.duracao_dias * 86400000)
    : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveFn({
        data: {
          id: isNovo ? undefined : form.id,
          nome: form.nome ?? null,
          ativo: form.ativo,
          numero_destino: form.numero_destino ?? "",
          duracao_dias: form.duracao_dias as 7 | 14 | 30,
          intensidade: form.intensidade as Intensidade,
          tipo_mensagem: form.tipo_mensagem as TipoMensagem,
          horario_inicio: form.horario_inicio.slice(0, 5),
          horario_fim: form.horario_fim.slice(0, 5),
          dias_semana: form.dias_semana,
        },
      });
      toast.success(isNovo ? "Chip criado!" : "Configuração salva.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remover este chip?")) return;
    setRemoving(true);
    try {
      await delFn({ data: { id: chip.id } });
      toast.success("Chip removido.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setRemoving(false);
    }
  };

  const handleToggle = async (ativo: boolean) => {
    try {
      await toggleFn({ data: { id: chip.id, ativo } });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  };

  const toggleDia = (d: number) => {
    setForm((f) => ({
      ...f,
      dias_semana: f.dias_semana.includes(d)
        ? f.dias_semana.filter((x) => x !== d)
        : [...f.dias_semana, d].sort(),
    }));
  };

  return (
    <div className="rounded-xl border border-border bg-background/50 p-4 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={form.nome ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
          placeholder="Nome do chip (ex: Chip 1)"
          className="h-8 max-w-[180px] text-sm"
        />
        <StatusBadge status={chip.status} ativo={chip.ativo} isNovo={isNovo} />
        <div className="ml-auto flex items-center gap-1">
          {!isNovo && (
            <>
              {chip.ativo ? (
                <Button size="sm" variant="ghost" onClick={() => handleToggle(false)}>
                  <PauseCircle className="h-4 w-4 mr-1" /> Pausar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleToggle(true)}
                  disabled={!connected || !chip.numero_destino}
                >
                  <PlayCircle className="h-4 w-4 mr-1" /> Retomar
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={handleDelete}
                disabled={removing}
                aria-label="Remover chip"
              >
                {removing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 text-destructive" />
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Linha 1: número + duração */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Número de destino (com DDD)</Label>
          <Input
            value={form.numero_destino ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, numero_destino: e.target.value }))}
            placeholder="11999999999"
            disabled={!connected}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Duração</Label>
          <div className="flex gap-1">
            {DURACOES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setForm((f) => ({ ...f, duracao_dias: d }))}
                disabled={!connected}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-md border-2 text-xs font-medium transition-colors",
                  form.duracao_dias === d
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-secondary/50",
                )}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Linha 2: intensidade + tipo */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Intensidade</Label>
          <div className="flex gap-1">
            {INTENSIDADES.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, intensidade: it.id }))}
                disabled={!connected}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-md border-2 text-[11px] font-medium transition-colors text-center leading-tight",
                  form.intensidade === it.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-secondary/50",
                )}
                title={it.desc}
              >
                <div>{it.label}</div>
                <div className="text-[9px] opacity-70">{it.desc}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo de mensagem</Label>
          <div className="flex gap-1">
            {TIPOS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, tipo_mensagem: t.id }))}
                disabled={!connected}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-md border-2 text-xs font-medium transition-colors",
                  form.tipo_mensagem === t.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-secondary/50",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Linha 3: horário + dias */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <Clock className="h-3 w-3" /> Horário de envio
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="time"
              value={form.horario_inicio.slice(0, 5)}
              onChange={(e) => setForm((f) => ({ ...f, horario_inicio: e.target.value }))}
              disabled={!connected}
              className="h-9"
            />
            <span className="text-xs text-muted-foreground">às</span>
            <Input
              type="time"
              value={form.horario_fim.slice(0, 5)}
              onChange={(e) => setForm((f) => ({ ...f, horario_fim: e.target.value }))}
              disabled={!connected}
              className="h-9"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Dias da semana
          </Label>
          <div className="flex gap-1">
            {DIAS_SEMANA_LABEL.map((lbl, i) => {
              const on = form.dias_semana.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDia(i)}
                  disabled={!connected}
                  title={DIAS_SEMANA_NOME[i]}
                  className={cn(
                    "h-9 w-9 rounded-md border-2 text-xs font-medium transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-secondary/50",
                  )}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Progresso (apenas chips existentes ativos) */}
      {!isNovo && chip.ativo && diaAtual > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              Dia {diaAtual} de {chip.duracao_dias}
            </span>
            <span className="text-muted-foreground">
              {chip.mensagens_hoje} / {meta} hoje
            </span>
          </div>
          <Progress value={progresso} className="h-1.5" />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Total: {chip.total_enviadas}</span>
            {estimativaFim && (
              <span>
                Aquecido em {estimativaFim.toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Histórico 7 dias */}
      {!isNovo && (
        <Historico7d historico={historico} meta={meta || 50} />
      )}

      {chip.ultimo_erro && (
        <div className="text-[11px] rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-2">
          Último erro: {chip.ultimo_erro}
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={form.ativo}
            onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
            disabled={!connected}
            className="h-4 w-4 accent-primary"
          />
          Ativar aquecimento
        </label>
        <div className="flex items-center gap-2">
          {isNovo && onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || !connected || (!isNovo && !dirty)}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {isNovo ? "Criar chip" : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  ativo,
  isNovo,
}: {
  status: string;
  ativo: boolean;
  isNovo?: boolean;
}) {
  if (isNovo) {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        NOVO
      </span>
    );
  }
  if (status === "concluido") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success">
        <CheckCircle2 className="h-3 w-3" /> Concluído
      </span>
    );
  }
  if (status === "erro") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
        <XCircle className="h-3 w-3" /> Erro
      </span>
    );
  }
  if (!ativo) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        <PauseCircle className="h-3 w-3" /> Pausado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-500">
      <Flame className="h-3 w-3" /> Aquecendo
    </span>
  );
}

function Historico7d({
  historico,
  meta,
}: {
  historico: Record<string, number>;
  meta: number;
}) {
  const dias = useMemo(() => {
    const out: { dia: string; label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      out.push({
        dia: key,
        label: d.toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3),
        count: historico[key] ?? 0,
      });
    }
    return out;
  }, [historico]);
  const max = Math.max(meta, ...dias.map((d) => d.count), 1);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        Últimos 7 dias
      </div>
      <div className="flex items-end gap-1 h-16">
        {dias.map((d) => {
          const pct = Math.round((d.count / max) * 100);
          return (
            <div key={d.dia} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full bg-muted rounded-sm relative flex-1 flex items-end">
                <div
                  className="w-full bg-orange-500/70 rounded-sm transition-all"
                  style={{ height: `${pct}%` }}
                  title={`${d.count} mensagens`}
                />
              </div>
              <div className="text-[9px] text-muted-foreground">{d.label}</div>
              <div className="text-[10px] font-medium leading-none">{d.count}</div>
            </div>
          );
        })}
      </div>
      <div className="text-[9px] text-muted-foreground mt-1">
        Faixa: {INTENSIDADE_RANGE.suave.min}–{INTENSIDADE_RANGE.agressivo.max} msgs/dia
      </div>
    </div>
  );
}
