import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getFunnelSummary } from "@/lib/funnel.functions";

const LABELS: Record<string, string> = {
  email_confirmed: "Email confirmado",
  first_search: "Primeira busca",
  first_lead: "Primeiro lead",
  whatsapp_connected: "WhatsApp conectado",
  first_message_sent: "Primeira mensagem",
  plans_viewed: "Viu os planos",
  checkout_clicked: "Clicou em assinar",
  purchase_approved: "Compra aprovada",
};

export function FunnelSummaryCard() {
  const [days, setDays] = useState(30);
  const getSummary = useServerFn(getFunnelSummary);
  const query = useQuery({
    queryKey: ["admin-funnel", days],
    queryFn: () => getSummary({ data: { days } }),
  });

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <BarChart3 className="h-5 w-5 text-primary" />
        <div>
          <h2 className="font-semibold">Funil de novos clientes</h2>
          <p className="text-xs text-muted-foreground">Contagens agregadas, sem dados pessoais.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {[7, 30, 90].map((value) => (
            <Button key={value} size="sm" variant={days === value ? "default" : "outline"} onClick={() => setDays(value)}>
              {value} dias
            </Button>
          ))}
          <Button size="icon" variant="ghost" onClick={() => query.refetch()} aria-label="Atualizar funil">
            <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </div>
      {query.isLoading ? (
        <div className="grid min-h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : query.isError || !query.data ? (
        <p className="p-6 text-sm text-destructive">Não foi possível carregar o funil.</p>
      ) : (
        <div className="p-4">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="Cadastros" value={query.data.signups} />
            <Metric label="Planos pagos" value={query.data.paid} />
            <Metric label="Pedidos vinculados" value={query.data.orders} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {query.data.steps.map((step) => (
              <div key={step.name} className="rounded-md border border-border bg-secondary/20 p-3">
                <div className="text-xs text-muted-foreground">{LABELS[step.name] ?? step.name}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{step.users}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}