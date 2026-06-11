import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, AlertTriangle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getAquecimentoConfig,
  saveAquecimentoConfig,
} from "@/lib/aquecimento.functions";
import { metaDiaria } from "@/lib/aquecimento-shared";

const DURACOES = [7, 14, 30] as const;
type Duracao = (typeof DURACOES)[number];

export function AquecimentoCard({ connected }: { connected: boolean }) {
  const qc = useQueryClient();
  const getCfg = useServerFn(getAquecimentoConfig);
  const saveCfg = useServerFn(saveAquecimentoConfig);

  const { data: cfg } = useQuery({
    queryKey: ["aquecimento-config"],
    queryFn: () => getCfg(),
    refetchInterval: 15000,
  });

  const [ativo, setAtivo] = useState(false);
  const [numero, setNumero] = useState("");
  const [duracao, setDuracao] = useState<Duracao>(14);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    setAtivo(!!cfg.ativo);
    setNumero(cfg.numero_destino ?? "");
    if (DURACOES.includes(cfg.duracao_dias as Duracao)) {
      setDuracao(cfg.duracao_dias as Duracao);
    }
  }, [cfg]);

  const diaAtual = (() => {
    if (!cfg?.iniciado_em || !cfg.ativo) return 0;
    const diff = Date.now() - new Date(cfg.iniciado_em).getTime();
    return Math.min(cfg.duracao_dias, Math.floor(diff / (24 * 60 * 60 * 1000)) + 1);
  })();
  const meta = cfg?.ativo && diaAtual > 0 ? metaDiaria(diaAtual, cfg.duracao_dias) : 0;
  const progresso = cfg?.ativo && cfg.duracao_dias ? (diaAtual / cfg.duracao_dias) * 100 : 0;

  const salvar = async () => {
    setSaving(true);
    try {
      await saveCfg({ data: { ativo, numero_destino: numero, duracao_dias: duracao } });
      toast.success(ativo ? "Aquecimento ativado!" : "Configuração salva.");
      qc.invalidateQueries({ queryKey: ["aquecimento-config"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="grid place-items-center h-10 w-10 rounded-xl bg-orange-500/15 text-orange-500 shrink-0">
          <Flame className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">Aquecimento de número</h3>
            {cfg?.ativo && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-500">
                ATIVO
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Envia mensagens variadas em volume crescente para simular uso natural e preservar
            a reputação do seu número.
          </p>
        </div>
        <Switch checked={ativo} onCheckedChange={setAtivo} disabled={!connected} />
      </div>

      {!connected && (
        <div className="text-xs text-muted-foreground rounded-lg bg-muted/40 border border-border p-3">
          Conecte um WhatsApp primeiro para habilitar o aquecimento.
        </div>
      )}

      <div className="flex items-start gap-2 text-xs rounded-lg border border-warning/40 bg-warning/10 p-3 text-warning">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>Use um número secundário como destino.</strong> Nunca use o número
          principal do seu cliente — as mensagens são automáticas e em alto volume.
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="aq-numero">Número de destino (com DDD)</Label>
          <Input
            id="aq-numero"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="11999999999"
            disabled={!connected}
          />
          <p className="text-[11px] text-muted-foreground">Apenas números. Ex: 11999998888</p>
        </div>
        <div className="space-y-2">
          <Label>Duração do aquecimento</Label>
          <div className="flex gap-2">
            {DURACOES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuracao(d)}
                disabled={!connected}
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors disabled:opacity-50",
                  duracao === d
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

      {cfg?.ativo && diaAtual > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              Aquecendo — Dia {diaAtual} de {cfg.duracao_dias}
            </span>
            <span className="text-xs text-muted-foreground">
              {cfg.mensagens_hoje ?? 0} / {meta} hoje
            </span>
          </div>
          <Progress value={progresso} className="h-2" />
          <div className="text-[11px] text-muted-foreground">
            Total enviadas: {cfg.total_enviadas ?? 0} · meta diária aumenta gradualmente de 5
            até 50 mensagens.
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={saving || !connected}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar configuração
        </Button>
      </div>
    </div>
  );
}
