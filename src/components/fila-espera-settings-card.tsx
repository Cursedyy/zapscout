import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useHasSession } from "@/hooks/use-has-session";
import { getWhatsAppConfig, updateFilaSettings } from "@/lib/whatsapp.functions";

export function FilaEsperaSettingsCard() {
  const hasSession = useHasSession();
  const cfgFn = useServerFn(getWhatsAppConfig);
  const updateFn = useServerFn(updateFilaSettings);
  const qc = useQueryClient();

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["wa-config"],
    queryFn: () => cfgFn(),
    enabled: hasSession === true,
    staleTime: 20000,
  });

  const [filaAtiva, setFilaAtiva] = useState(true);
  const [intervalo, setIntervalo] = useState(60);

  useEffect(() => {
    if (cfg && "filaAtiva" in cfg) {
      setFilaAtiva(cfg.filaAtiva ?? true);
      setIntervalo(cfg.intervaloSegundos ?? 60);
    }
  }, [cfg]);

  const save = useMutation({
    mutationFn: (v: { filaAtiva: boolean; intervaloSegundos: number }) =>
      updateFn({ data: v }),
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["wa-config"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  return (
    <Card className="p-5 space-y-4 bg-gradient-card border-border">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Fila de espera de envios
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            Quando ativa, cada mensagem manual respeita um intervalo mínimo
            entre disparos. Isso protege o número contra bloqueios do WhatsApp.
          </p>
        </div>
        <Switch
          checked={filaAtiva}
          onCheckedChange={setFilaAtiva}
          disabled={isLoading || save.isPending}
        />
      </div>

      {filaAtiva ? (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs">Intervalo entre envios (segundos)</Label>
            <Input
              type="number"
              min={5}
              max={3600}
              value={intervalo}
              onChange={(e) => setIntervalo(Math.max(1, Number(e.target.value) || 60))}
              disabled={save.isPending}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Recomendado: 60s ou mais. Números novos: 90–180s.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex gap-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-destructive-foreground/90">
            <strong className="text-destructive">Atenção — risco de restrição no WhatsApp.</strong>{" "}
            Sem a fila de espera, as mensagens saem uma atrás da outra sem
            intervalo. O WhatsApp pode marcar seu número como spam, aplicar
            <em> shadowban</em>, exigir verificação por SMS ou banir a conta
            permanentemente. Use apenas se souber o que está fazendo.
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() =>
            save.mutate({ filaAtiva, intervaloSegundos: intervalo })
          }
          disabled={save.isPending || isLoading}
        >
          {save.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          Salvar
        </Button>
      </div>
    </Card>
  );
}
