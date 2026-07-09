import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2, Send, AlertTriangle, CheckCheck } from "lucide-react";
import { listEnviosManuaisFila } from "@/lib/whatsapp.functions";
import { useHasSession } from "@/hooks/use-has-session";
import type { MockLead } from "@/data/mock-leads";

type FilaItem = {
  id: string;
  numero: string;
  status?: string;
  agendado_para?: string | null;
  enviado_em?: string | null;
  tentativas?: number | null;
  ultimo_erro?: string | null;
  lead_id?: string | null;
};

function normTel(s: string | null | undefined) {
  const d = (s ?? "").replace(/\D/g, "");
  return d.startsWith("55") ? d.slice(2) : d;
}

function fmtEspera(ms: number) {
  if (ms <= 0) return "enviando agora";
  const s = Math.round(ms / 1000);
  if (s < 60) return `em ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `em ${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `em ${h}h${rm}m` : `em ${h}h`;
}

function fmtHora(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function LeadFilaStatus({ lead }: { lead: MockLead }) {
  const hasSession = useHasSession();
  const fn = useServerFn(listEnviosManuaisFila);
  const { data } = useQuery({
    queryKey: ["fila-envios-manuais"],
    queryFn: () => fn(),
    enabled: hasSession === true,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const match = useMemo<{ tipo: "pendente" | "recente"; item: FilaItem } | null>(() => {
    if (!data) return null;
    const alvoTel = normTel(lead.telefone);
    const pendentes = (data.pendentes ?? []) as unknown as FilaItem[];
    const recentes = (data.recentes ?? []) as unknown as FilaItem[];

    const matchByPhone = (it: FilaItem) => alvoTel && normTel(it.numero) === alvoTel;
    const matchByLead = (it: FilaItem) => lead.id && it.lead_id === lead.id;

    // Prioriza pendente mais próximo
    const pend = pendentes.find((i) => matchByLead(i) || matchByPhone(i));
    if (pend) return { tipo: "pendente", item: pend };

    // Depois um recente (enviado/falha)
    const rec = recentes.find((i) => matchByLead(i) || matchByPhone(i));
    if (rec) return { tipo: "recente", item: rec };
    return null;
  }, [data, lead.id, lead.telefone]);

  if (!match) return null;

  const { item } = match;
  const agendado = item.agendado_para ? new Date(item.agendado_para).getTime() : 0;
  const agora = Date.now();
  const emAtraso = agendado > 0 && agendado <= agora;

  if (match.tipo === "pendente") {
    // "Enviando" quando já venceu o horário; senão pendente com ETA
    const tentativas = item.tentativas ?? 0;
    const falhou = tentativas > 0 && !!item.ultimo_erro;

    if (emAtraso) {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
          Enviando…
          {tentativas > 0 && <span className="text-muted-foreground">· tentativa {tentativas + 1}</span>}
        </div>
      );
    }
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning"
        title={
          item.ultimo_erro
            ? `Última falha: ${item.ultimo_erro}`
            : `Próximo envio: ${fmtHora(item.agendado_para ?? "")}`
        }
      >
        {falhou ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
        <span>Na fila · {fmtEspera(agendado - agora)}</span>
        <span className="text-muted-foreground">· {fmtHora(item.agendado_para ?? "")}</span>
      </div>
    );
  }

  // Recente: enviado ou falha
  if (item.status === "enviado") {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success"
        title={item.enviado_em ? `Enviado às ${fmtHora(item.enviado_em)}` : undefined}
      >
        <CheckCheck className="h-3 w-3" />
        Enviado {item.enviado_em ? `· ${fmtHora(item.enviado_em)}` : ""}
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
      title={item.ultimo_erro ?? "Falha ao enviar"}
    >
      <Send className="h-3 w-3" />
      Falhou
      {(item.tentativas ?? 0) > 0 && (
        <span className="text-muted-foreground">· {item.tentativas} tentativas</span>
      )}
    </div>
  );
}
