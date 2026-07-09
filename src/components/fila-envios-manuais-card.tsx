import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listEnviosManuaisFila } from "@/lib/whatsapp.functions";
import { useHasSession } from "@/hooks/use-has-session";

type Item = {
  id: string;
  numero: string;
  texto: string;
  agendado_para?: string | null;
  enviado_em?: string | null;
  status?: string;
  tentativas?: number | null;
  ultimo_erro?: string | null;
  lead_nome?: string | null;
};

function fmtEspera(iso?: string | null) {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "agora";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `em ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `em ${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `em ${h}h ${rm}m`;
}

function fmtHora(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function mask(numero: string) {
  const d = numero.replace(/\D/g, "");
  if (d.length < 4) return numero;
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
}

export function FilaEnviosManuaisCard() {
  const hasSession = useHasSession();
  const fn = useServerFn(listEnviosManuaisFila);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["envios-manuais-fila"],
    queryFn: () => fn(),
    enabled: hasSession === true,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const pendentes = (data?.pendentes ?? []) as Item[];
  const recentes = (data?.recentes ?? []) as Item[];

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Fila de envios manuais
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Mensagens enviadas pelo botão "Enviar mensagem" que ainda estão aguardando disparo.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2 hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      <div className="p-4 space-y-6">
        {/* Pendentes */}
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Pendentes ({pendentes.length})
          </div>
          {isLoading ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> carregando…
            </div>
          ) : pendentes.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Nenhuma mensagem na fila. Envios feitos pelo botão "Enviar mensagem" aparecerão aqui
              enquanto aguardam o intervalo mínimo entre disparos.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-medium py-2 pr-3">Para</th>
                    <th className="text-left font-medium py-2 pr-3">Mensagem</th>
                    <th className="text-left font-medium py-2 pr-3">Envio previsto</th>
                    <th className="text-left font-medium py-2">Tentativas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pendentes.map((it) => (
                    <tr key={it.id}>
                      <td className="py-2 pr-3 align-top">
                        <div className="font-medium text-foreground">
                          {it.lead_nome ?? mask(it.numero)}
                        </div>
                        {it.lead_nome && (
                          <div className="text-[11px] text-muted-foreground">{mask(it.numero)}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3 align-top max-w-[280px]">
                        <div className="line-clamp-2 text-muted-foreground">{it.texto}</div>
                      </td>
                      <td className="py-2 pr-3 align-top whitespace-nowrap">
                        <div className="text-foreground">{fmtEspera(it.agendado_para)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtHora(it.agendado_para)}
                        </div>
                      </td>
                      <td className="py-2 align-top">
                        {it.tentativas ?? 0}
                        {it.ultimo_erro && (
                          <div className="text-[11px] text-destructive mt-1 line-clamp-2 max-w-[200px]">
                            {it.ultimo_erro}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Últimos processados */}
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Últimas 24h ({recentes.length})
          </div>
          {recentes.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nada processado nas últimas 24h.</div>
          ) : (
            <ul className="space-y-1.5">
              {recentes.slice(0, 15).map((it) => {
                const ok = it.status === "enviado";
                return (
                  <li key={it.id} className="flex items-start gap-2 text-xs">
                    {ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {it.lead_nome ?? mask(it.numero)}
                        </span>
                        <span className="text-muted-foreground">
                          {fmtHora(it.enviado_em ?? it.agendado_para)}
                        </span>
                      </div>
                      {!ok && it.ultimo_erro && (
                        <div className="text-destructive line-clamp-1">{it.ultimo_erro}</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
