import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MapPin, Phone, Globe, GlobeLock, Plus, Check, CheckCheck } from "lucide-react";
import { WhatsAppButton } from "./whatsapp-button";
import { ScoreBadge, ScoreDetailDialog, useLeadScore } from "./score-badge";
import type { MockLead } from "@/data/mock-leads";
import { usePlano, useStore } from "@/store/app-store";
import { isSiteProprio } from "@/lib/site-check";
import { toast } from "sonner";

function iniciais(s: string) {
  return s.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function LeadCard({ lead }: { lead: MockLead }) {
  const { leads, addLead } = useStore();
  const plano = usePlano();
  const normTel = (s?: string | null) => (s ?? "").replace(/\D/g, "");
  const leadNoCrm = leads.find(
    (l) =>
      l.id === lead.id ||
      (l.nome === lead.nome && l.telefone === lead.telefone) ||
      (!!lead.telefone && normTel(l.telefone) === normTel(lead.telefone)),
  );
  const inCrm = !!leadNoCrm;
  const semNumeroChecado = leadNoCrm?.status === "sem_numero";
  const msgEnviada = !!leadNoCrm?.history?.some((h) =>
    /whatsapp enviada|follow-up automático #\d+ enviado|mensagem enviada/i.test(h.text),
  );
  const notaBaixa = lead.avaliacao < 3.5;
  const { scoreData, loading } = useLeadScore(lead);
  const [scoreOpen, setScoreOpen] = useState(false);
  const bloqueadoIA = plano.id === "free";

  const addCRM = () => {
    if (addLead(lead)) toast.success("Lead adicionado ao CRM ✓");
    else toast("Esse lead já está no CRM");
  };

  return (
    <Card className="p-4 flex flex-col gap-3 bg-gradient-card border-border hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="grid place-items-center h-10 w-10 rounded-lg bg-primary/15 text-primary font-semibold text-sm shrink-0">
          {iniciais(lead.nome)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-tight truncate flex items-center gap-1.5">
            <span className="truncate">{lead.nome}</span>
            {msgEnviada && (
              <span
                title="Mensagem enviada"
                className="shrink-0 inline-flex items-center justify-center h-4 w-4 rounded-full bg-[color:var(--color-zap)]/15 text-[color:var(--color-zap)]"
              >
                <CheckCheck className="h-3 w-3" />
              </span>
            )}
            {semNumeroChecado && (
              <span
                title="Checado — sem telefone"
                className="shrink-0 inline-flex items-center justify-center h-4 w-4 rounded-full bg-warning/15 text-warning"
              >
                <Check className="h-3 w-3" />
              </span>
            )}
          </div>
          {lead.avaliacao > 0 ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Star className="h-3 w-3 fill-warning text-warning" />
              <span className="text-foreground font-medium">{lead.avaliacao.toFixed(1)}</span>
              <span>({lead.totalAvaliacoes})</span>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground mt-0.5">Sem avaliações no Google</div>
          )}
        </div>
        <div className="shrink-0">
          {loading || !scoreData ? (
            <Skeleton className="h-5 w-14 rounded-full" />
          ) : (
            <ScoreBadge
              score={scoreData.score}
              classificacao={scoreData.classificacao}
              bloqueadoIA={bloqueadoIA}
              onClick={() => setScoreOpen(true)}
            />
          )}
        </div>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-start gap-2"><MapPin className="h-3 w-3 mt-0.5 shrink-0" /><span className="truncate">{lead.endereco}, {lead.cidade}</span></div>
        <div className="flex items-center gap-2">
          <Phone className="h-3 w-3" />
          {lead.telefone
            ? <span>{lead.telefone}</span>
            : <span className="text-muted-foreground/70">Sem telefone cadastrado</span>}
        </div>
        <div className="flex items-center gap-2">
          {isSiteProprio(lead.site)
            ? <><Globe className="h-3 w-3" /><span className="truncate">{lead.site}</span></>
            : <><GlobeLock className="h-3 w-3 text-destructive" /><span className="text-destructive">Sem site</span></>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        {!isSiteProprio(lead.site) && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/15 text-destructive">Sem site</span>}
        {notaBaixa && lead.totalAvaliacoes > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/15 text-warning">Nota baixa</span>}
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary/40 text-muted-foreground">{lead.nicho}</span>
        <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] text-muted-foreground bg-muted/40">via Google Maps</span>
      </div>

      <div className="flex gap-2 mt-auto">
        <WhatsAppButton lead={lead} label="WhatsApp" />
        <Button size="sm" variant={inCrm ? "secondary" : "outline"} onClick={addCRM} disabled={inCrm} className="flex-1">
          {inCrm ? <><Check className="h-4 w-4" /> No CRM</> : <><Plus className="h-4 w-4" /> CRM</>}
        </Button>
      </div>

      <ScoreDetailDialog
        open={scoreOpen}
        onClose={() => setScoreOpen(false)}
        scoreData={scoreData}
        leadNome={lead.nome}
        bloqueadoIA={bloqueadoIA}
      />
    </Card>
  );
}
