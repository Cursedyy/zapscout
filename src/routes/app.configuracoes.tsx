import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useStore, usePlano } from "@/store/app-store";
import { PLANOS, type PlanoId } from "@/data/planos";
import { toast } from "sonner";

export const Route = createFileRoute("/app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ConfigPage,
});

function ConfigPage() {
  const { user } = useAuth();
  const plano = usePlano();
  const { setPlano, pularPreviewWA, setPularPreviewWA } = useStore();

  return (
    <div className="p-4 sm:p-6 md:p-10 pt-16 md:pt-10 max-w-3xl mx-auto">
      <PageHeader title="Configurações" subtitle="Gerencie sua conta e preferências" />

      <div className="space-y-4">
        <Card className="p-5">
          <div className="text-sm font-medium mb-3">Conta</div>
          <div className="text-xs text-muted-foreground">Email</div>
          <div className="text-sm">{user?.email ?? "—"}</div>
        </Card>

        <Card className="p-5">
          <div className="text-sm font-medium mb-3">Plano atual</div>
          <div className="text-sm">Plano <span className="text-primary font-medium">{plano.nome}</span> — R$ {plano.preco}/mês</div>
          <Button asChild className="mt-3" variant="outline" size="sm"><Link to="/planos">Ver todos os planos</Link></Button>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2">Modo demo — alternar plano:</div>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(PLANOS) as PlanoId[]).map((id) => (
                <Button key={id} size="sm" variant={plano.id === id ? "default" : "outline"} onClick={() => { setPlano(id); toast.success(`Plano ${PLANOS[id].nome} ativado ✓`); }}>
                  {PLANOS[id].nome}
                </Button>
              ))}
            </div>
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
