import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listarAuditLog } from "@/lib/leads-audit.functions";
import { useHasSession } from "@/hooks/use-has-session";
import { PageHeader } from "@/components/page-header";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/app/auditoria-leads")({
  component: AuditoriaLeadsPage,
  head: () => ({
    meta: [{ title: "Auditoria de leads · ZapScout" }],
  }),
});

const ORIGEM_LABEL: Record<string, string> = {
  "cron:process-envios-manuais": "Fila de envios",
  "cron:process-followups": "Follow-ups automáticos",
  "cron:process-campaigns": "Campanhas",
  "ia-vendas": "IA de Vendas",
};

const STATUS_LABEL: Record<string, string> = {
  novo: "Novo",
  contatado: "Contatado",
  respondeu: "Respondeu",
  negociacao: "Negociação",
  fechado: "Fechado",
  perdido: "Perdido",
  sem_numero: "Sem número",
};

function AuditoriaLeadsPage() {
  const hasSession = useHasSession();
  const listar = useServerFn(listarAuditLog);
  const { data, isLoading, error } = useQuery({
    queryKey: ["leads-audit-log"],
    queryFn: () => listar({ data: { limit: 200 } }),
    enabled: hasSession === true,
    refetchInterval: 30_000,
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="Auditoria de leads"
        subtitle="Histórico de mudanças automáticas de status feitas por cron jobs e pela IA de Vendas — para você saber quando, quem e por qual motivo cada lead foi movido."
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando log…
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Falha ao carregar auditoria: {(error as Error).message}
        </div>
      )}

      {data && data.length === 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground text-center">
          Nenhuma mudança automática de status registrada ainda. Quando um cron
          (fila, campanhas, follow-ups) ou a IA de Vendas moverem um lead, o
          evento aparece aqui.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Quando</th>
                <th className="text-left px-3 py-2">Lead</th>
                <th className="text-left px-3 py-2">De → Para</th>
                <th className="text-left px-3 py-2">Origem</th>
                <th className="text-left px-3 py-2">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const detalhes = r.detalhes_json
                  ? (() => {
                      try {
                        const obj = JSON.parse(r.detalhes_json!) as Record<string, unknown>;
                        return Object.entries(obj)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ");
                      } catch {
                        return r.detalhes_json;
                      }
                    })()
                  : "—";
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-3 py-2">{r.lead_nome ?? r.lead_id.slice(0, 8)}</td>
                    <td className="px-3 py-2">
                      <span className="text-muted-foreground">
                        {r.status_anterior ? (STATUS_LABEL[r.status_anterior] ?? r.status_anterior) : "—"}
                      </span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className="font-medium text-primary">
                        {STATUS_LABEL[r.status_novo] ?? r.status_novo}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs">
                        {ORIGEM_LABEL[r.origem] ?? r.origem}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[280px] truncate" title={detalhes}>
                      {detalhes}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
