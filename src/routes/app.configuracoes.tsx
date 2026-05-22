import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useStore, usePlano } from "@/store/app-store";
import { PLANOS } from "@/data/planos";
import { toast } from "sonner";
import { Clock, Send } from "lucide-react";

export const Route = createFileRoute("/app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ConfigPage,
});

function ConfigPage() {
  const { user, loading: authLoading } = useAuth();
  const plano = usePlano();
  const {
    pularPreviewWA, setPularPreviewWA,
    followupDias, setFollowupDias,
    defaultIntervaloSegundos, setDefaultIntervaloSegundos,
  } = useStore();

  const limiteHora = Math.max(1, Math.round(3600 / Math.max(1, defaultIntervaloSegundos)));

  const updateDia = (idx: 0 | 1 | 2, val: number) => {
    const v = Math.max(0, Math.min(30, Math.round(val)));
    const novo = [...followupDias] as [number, number, number];
    novo[idx] = v;
    setFollowupDias(novo);
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-3xl mx-auto">
      <PageHeader title="Configurações" subtitle="Gerencie sua conta e preferências" />

      <div className="space-y-4">
        <Card className="p-5">
          <div className="text-sm font-medium mb-3">Conta</div>
          <div className="text-xs text-muted-foreground">Email</div>
          {authLoading ? (
            <div className="h-4 w-48 rounded bg-secondary/60 animate-pulse mt-1" />
          ) : (
            <div className="text-sm">{user?.email ?? "—"}</div>
          )}
        </Card>

        <Card className="p-5">
          <div className="text-sm font-medium mb-3">Plano atual</div>
          {authLoading ? (
            <div className="h-4 w-40 rounded bg-secondary/60 animate-pulse" />
          ) : (
            <div className="text-sm">Plano <span className="text-primary font-medium">{plano.nome}</span> — R$ {plano.preco}/mês</div>
          )}
          <Button asChild className="mt-3" variant="outline" size="sm"><Link to="/planos">Ver todos os planos</Link></Button>

        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1"><Clock className="h-4 w-4 text-primary" /><div className="text-sm font-medium">Cadência de follow-up automático</div></div>
          <p className="text-xs text-muted-foreground mb-4">
            Quantos dias aguardar entre cada mensagem da sequência (a partir do envio anterior). Aplica-se a todos os leads com cadência ativa.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="space-y-1.5">
                <Label className="text-xs">Follow-up {idx + 1} — dias</Label>
                <Input
                  type="number" min={0} max={30}
                  value={followupDias[idx]}
                  onChange={(e) => updateDia(idx as 0 | 1 | 2, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Cadência atual: <span className="text-foreground font-medium">D+{followupDias[0]} · D+{followupDias[0] + followupDias[1]} · D+{followupDias[0] + followupDias[1] + followupDias[2]}</span> após o início.
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setFollowupDias([1, 2, 3]); toast.success("Cadência restaurada (1, 2, 3 dias)"); }}>
              Restaurar padrão
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setFollowupDias([2, 4, 7]); toast.success("Cadência mais espaçada (2, 4, 7 dias)"); }}>
              Sugerir (2, 4, 7)
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1"><Send className="h-4 w-4 text-primary" /><div className="text-sm font-medium">Intervalo entre mensagens em campanhas</div></div>
          <p className="text-xs text-muted-foreground mb-4">
            Tempo padrão de espera entre cada disparo em uma campanha em lote. Você pode sobrescrever em cada campanha. Intervalos maiores reduzem o risco de bloqueio no WhatsApp.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Intervalo: <span className="text-foreground font-medium">{defaultIntervaloSegundos}s</span> · ≈ {limiteHora}/h</Label>
            <Input
              type="range" min={30} max={600} step={10}
              value={defaultIntervaloSegundos}
              onChange={(e) => setDefaultIntervaloSegundos(Number(e.target.value))}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>30s (rápido / alto risco)</span>
              <span>600s (10 min, seguro)</span>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {[60, 120, 180, 300].map((s) => (
              <Button key={s} size="sm" variant={defaultIntervaloSegundos === s ? "default" : "outline"} onClick={() => setDefaultIntervaloSegundos(s)}>
                {s}s
              </Button>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-sm font-medium mb-3">Preferências</div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={pularPreviewWA} onChange={(e) => setPularPreviewWA(e.target.checked)} />
            Pular preview da mensagem antes de abrir o WhatsApp
          </label>
        </Card>
      </div>
    </div>
  );
}
