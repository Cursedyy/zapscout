import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store/app-store";
import {
  getProspeccaoAutoConfig,
  salvarProspeccaoAutoConfig,
  type ProspeccaoAutoConfig,
} from "@/lib/prospeccao-auto.functions";

export function ProspeccaoAutoCard() {
  const getCfg = useServerFn(getProspeccaoAutoConfig);
  const saveCfg = useServerFn(salvarProspeccaoAutoConfig);
  const { templates: templatesStore } = useStore();

  const [cfg, setCfg] = useState<ProspeccaoAutoConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getCfg();
        if (alive) {
          setCfg(data);
          const localTemplateId = localStorage.getItem("zs:prospeccao_template_id");
          if (localTemplateId) {
            setCfg((c) => c ? { ...c, template_id: localTemplateId } : c);
          }
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { alive = false; };
  }, [getCfg]);

  if (!cfg) {
    return (
      <Card className="p-5">
        <div className="h-4 w-40 rounded bg-secondary/60 animate-pulse" />
      </Card>
    );
  }

  const update = <K extends keyof ProspeccaoAutoConfig>(k: K, v: ProspeccaoAutoConfig[K]) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));

  const onSave = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      if (cfg.template_id) {
        localStorage.setItem("zs:prospeccao_template_id", cfg.template_id);
      }
      await saveCfg({
        data: {
          ativo: cfg.ativo,
          nicho: cfg.nicho,
          cidade: cfg.cidade,
          score_min: cfg.score_min,
          limite_diario: cfg.limite_diario,
          template_id: cfg.template_id,
          template_mensagem: cfg.template_mensagem,
          intervalo_segundos: cfg.intervalo_segundos,
        },
      });
      toast.success("Prospecção automática salva");
    } catch (e) {
      toastErro(e, "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <div className="text-sm font-medium">Prospecção automática</div>
        </div>
        <Switch checked={cfg.ativo} onCheckedChange={(v) => update("ativo", v)} />
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Busca leads novos diariamente no nicho e cidade configurados, filtra por score, evita reenvio
        e dispara automaticamente respeitando o limite diário.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Nicho alvo</Label>
          <Input
            value={cfg.nicho}
            onChange={(e) => update("nicho", e.target.value)}
            placeholder="ex.: dentistas"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Cidade alvo</Label>
          <Input
            value={cfg.cidade}
            onChange={(e) => update("cidade", e.target.value)}
            placeholder="ex.: Curitiba"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Score mínimo (0-100)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={cfg.score_min}
            onChange={(e) => update("score_min", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Limite diário de disparos</Label>
          <Input
            type="number"
            min={1}
            max={500}
            value={cfg.limite_diario}
            onChange={(e) => update("limite_diario", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Template</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={cfg.template_id ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              const tpl = templatesStore.find((t) => t.id === id);
              setCfg((c) => c ? { ...c, template_id: id, template_mensagem: tpl?.mensagem ?? null } : c);
            }}
          >
            <option value="">— Selecione —</option>
            {templatesStore.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Intervalo entre mensagens (s)</Label>
          <Input
            type="number"
            min={30}
            max={3600}
            value={cfg.intervalo_segundos}
            onChange={(e) => update("intervalo_segundos", Number(e.target.value))}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Enviados hoje: <span className="text-foreground font-medium">{cfg.enviados_hoje}</span>
          {cfg.ultimo_run_data ? ` · última execução ${cfg.ultimo_run_data}` : ""}
        </div>
        <Button onClick={onSave} disabled={saving} size="sm">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Card>
  );
}
