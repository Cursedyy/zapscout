import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/app-store";
import { listarPendentes, listarVencidos, formatarPrazo, TOTAL_STEPS } from "@/lib/followups";
import { renderTemplate, templateParaStep } from "@/data/templates";
import { Clock, MessageCircle, CheckCircle2, PauseCircle, Inbox, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/follow-ups")({
  head: () => ({ meta: [{ title: "Follow-ups automáticos — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: FollowUpsPage,
});

function FollowUpsPage() {
  const { leads, templates, markFollowUpSent, stopSequence, marcarRespondeu, followupDias } = useStore();
  const pendentes = useMemo(() => listarPendentes(leads, followupDias), [leads, followupDias]);
  const vencidos = pendentes.filter((p) => p.atrasoMs >= 0);
  const agendados = pendentes.filter((p) => p.atrasoMs < 0);

  const ativos = leads.filter((l) => l.sequence?.enabled).length;
  const enviadosTotal = leads.reduce((acc, l) => acc + (l.sequence?.sentSteps.length ?? 0), 0);

  const disparar = (leadId: string, step: number) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const tpl = templateParaStep(templates, step as 1 | 2 | 3);
    const texto = renderTemplate(
      tpl?.mensagem ?? `Oi {{nome}}, tudo bem?`,
      { nome: lead.nome, cidade: lead.cidade, nicho: lead.nicho, avaliacao: lead.avaliacao, telefone: lead.telefone, endereco: lead.endereco },
    );
    const fone = lead.telefone.replace(/\D/g, "");
    window.open(`https://wa.me/55${fone}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    markFollowUpSent(leadId, step);
    toast.success(`Follow-up #${step} enviado para ${lead.nome} ✓`);
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 pt-16 md:pt-10 max-w-[1400px] mx-auto">
      <PageHeader
        title="Follow-ups automáticos"
        subtitle={`Cadência de ${TOTAL_STEPS} mensagens · ${followupDias.join(", ")} dias após o envio anterior · para quando o lead responde`}
      />
      <div className="text-xs text-muted-foreground -mt-4 mb-4">
        Ajustar dias da cadência em <Link to="/app/configuracoes" className="text-primary hover:underline">Configurações</Link>.
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <Stat icon={<Zap className="h-4 w-4 text-primary" />} label="Cadências ativas" value={ativos} />
        <Stat icon={<Clock className="h-4 w-4 text-warning" />} label="Vencidos agora" value={vencidos.length} highlight={vencidos.length > 0} />
        <Stat icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Follow-ups enviados" value={enviadosTotal} />
      </div>

      <Secao
        titulo={`Para enviar agora (${vencidos.length})`}
        descricao="Mensagens cujo prazo já venceu. Clique em enviar para abrir o WhatsApp com o template do passo atual."
        vazio="Tudo em dia! Nenhum follow-up vencido."
        cor="warning"
      >
        {vencidos.map((p) => (
          <ItemFollowUp
            key={p.lead.id}
            lead={p.lead}
            step={p.step}
            prazoLabel={formatarPrazo(p.atrasoMs)}
            urgente
            onEnviar={() => disparar(p.lead.id, p.step)}
            onRespondeu={() => { marcarRespondeu(p.lead.id); toast.success("Cadência pausada ✓"); }}
            onPausar={() => { stopSequence(p.lead.id, "manual"); toast("Cadência pausada"); }}
          />
        ))}
      </Secao>

      <Secao
        titulo={`Agendados (${agendados.length})`}
        descricao="Próximos disparos automáticos."
        vazio="Nenhum follow-up agendado."
        cor="muted"
      >
        {agendados.map((p) => (
          <ItemFollowUp
            key={p.lead.id}
            lead={p.lead}
            step={p.step}
            prazoLabel={formatarPrazo(p.atrasoMs)}
            onEnviar={() => disparar(p.lead.id, p.step)}
            onRespondeu={() => { marcarRespondeu(p.lead.id); toast.success("Cadência pausada ✓"); }}
            onPausar={() => { stopSequence(p.lead.id, "manual"); toast("Cadência pausada"); }}
          />
        ))}
      </Secao>

      {leads.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-muted-foreground">
          <Inbox className="h-10 w-10 mx-auto mb-3 text-primary/50" />
          <p className="font-medium text-foreground mb-1">Nenhum lead no CRM ainda</p>
          <p className="text-sm mb-4">Adicione leads e ative a cadência automática a partir da página do lead.</p>
          <Link to="/app/buscar"><Button>Buscar leads</Button></Link>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", highlight ? "border-warning/50" : "border-border")}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function Secao({ titulo, descricao, vazio, cor, children }: { titulo: string; descricao: string; vazio: string; cor: "warning" | "muted"; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className="mb-6">
      <div className="mb-2">
        <h2 className={cn("text-sm font-semibold", cor === "warning" ? "text-warning" : "text-foreground")}>{titulo}</h2>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </div>
      {hasChildren ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-xs text-muted-foreground">{vazio}</div>
      )}
    </section>
  );
}

function ItemFollowUp({
  lead, step, prazoLabel, urgente, onEnviar, onRespondeu, onPausar,
}: {
  lead: { id: string; nome: string; telefone: string; cidade: string; status: string };
  step: number;
  prazoLabel: string;
  urgente?: boolean;
  onEnviar: () => void;
  onRespondeu: () => void;
  onPausar: () => void;
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3",
      urgente ? "border-warning/40" : "border-border",
    )}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{lead.nome}</span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">Passo {step}/{TOTAL_STEPS}</span>
          <span className={cn("text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded",
            urgente ? "bg-warning/20 text-warning" : "bg-muted/40 text-muted-foreground")}>
            {prazoLabel}
          </span>
        </div>
        <div className="text-xs text-muted-foreground truncate">{lead.telefone} · {lead.cidade} · status: {lead.status}</div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" variant="ghost" onClick={onPausar} title="Pausar cadência">
          <PauseCircle className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={onRespondeu} title="Marcar como respondido (encerra a cadência)">
          <CheckCircle2 className="h-4 w-4" /> Respondeu
        </Button>
        <Button size="sm" onClick={onEnviar} className="bg-[color:var(--color-zap)] hover:bg-[color:var(--color-zap-dark)] text-white">
          <MessageCircle className="h-4 w-4" /> Enviar #{step}
        </Button>
      </div>
    </div>
  );
}
