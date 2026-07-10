import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { traduzirErro } from "@/lib/traduzir-erro";

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
    onError: (e) => toast.error(traduzirErro(e instanceof Error ? e.message : "Falha ao salvar")),
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
        <div className="space-y-2">
          <Label className="text-xs">Intervalo entre envios (segundos)</Label>
          <Input
            type="number"
            min={5}
            max={3600}
            value={intervalo}
            onChange={(e) => setIntervalo(Math.max(1, Number(e.target.value) || 60))}
            disabled={save.isPending}
          />
          <p className="text-[11px] text-muted-foreground">
            Disponível em todos os planos. Recomendado: <strong>60s ou mais</strong>.
            Números novos ou recém-conectados: <strong>90–180s</strong>.
          </p>

          {intervalo < 30 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2.5 flex gap-2 text-[11px]">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <span className="text-destructive-foreground/90">
                <strong className="text-destructive">Risco muito alto de banimento.</strong>{" "}
                Menos de 30s entre envios é padrão de spam para o WhatsApp.
                Aumente para no mínimo <strong>60s</strong>.
              </span>
            </div>
          )}
          {intervalo >= 30 && intervalo < 60 && (
            <div className="rounded-md border border-warning/50 bg-warning/10 p-2.5 flex gap-2 text-[11px]">
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <span className="text-warning-foreground/90">
                <strong className="text-warning">Intervalo abaixo do seguro.</strong>{" "}
                Entre 30s e 60s ainda há risco de shadowban. O ideal é
                começar em <strong>60s</strong>.
              </span>
            </div>
          )}
          {intervalo >= 60 && intervalo < 90 && (
            <div className="rounded-md border border-primary/40 bg-primary/10 p-2.5 flex gap-2 text-[11px] text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                Intervalo aceitável para números com histórico. Se o número é
                novo, prefira <strong>90s ou mais</strong>.
              </span>
            </div>
          )}
          {intervalo >= 90 && (
            <div className="rounded-md border border-success/40 bg-success/10 p-2.5 flex gap-2 text-[11px] text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
              <span>
                <strong className="text-success">Intervalo seguro.</strong>{" "}
                Boa proteção contra restrições do WhatsApp.
              </span>
            </div>
          )}
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
