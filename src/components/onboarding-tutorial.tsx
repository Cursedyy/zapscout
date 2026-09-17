import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  Search,
  Smartphone,
  FileText,
  Send,
  Repeat,
  BarChart3,
  Check,
  SkipForward,
  ChevronRight,
  ChevronLeft,
  Kanban,
  Zap,
  ShieldCheck,
} from "lucide-react";

export const TUTORIAL_KEY = "zs_tutorial_v4";

interface Step {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  bullets?: string[];
  tip?: string;
  href: string;
  ctaLabel?: string;
}

const STEPS: Step[] = [
  {
    icon: Rocket,
    title: "Bem-vindo ao ZapScout 🚀",
    description:
      "Sua máquina de prospecção via WhatsApp. Em poucos minutos você acha clientes, dispara mensagens com segurança e vê o funil se mover sozinho.",
    bullets: ["Busca de leads reais no Google Maps", "Conexão direta com seu WhatsApp", "CRM que acompanha cada contato"],
    href: "/app",
    ctaLabel: "Vamos lá",
  },
  {
    icon: Search,
    title: "1. Buscar leads",
    description:
      "Escolha nicho e cidade — o ZapScout traz negócios reais com telefone, site e avaliação.",
    bullets: [
      "Até 20 resultados por busca (100 no plano Dono)",
      "Salve direto no CRM ou envie mensagem individual",
      "Leads sem WhatsApp vão automaticamente para a coluna Sem número",
    ],
    href: "/app/buscar",
    ctaLabel: "Abrir busca",
  },
  {
    icon: Smartphone,
    title: "2. Conectar WhatsApp",
    description:
      "Sem número conectado, nada é enviado. Escaneie o QR code em WhatsApp → Conectar.",
    tip: "Ative o Aquecimento na mesma tela para chips novos — o sistema aumenta o volume aos poucos para evitar ban.",
    href: "/app/whatsapp",
    ctaLabel: "Conectar WhatsApp",
  },
  {
    icon: Send,
    title: "3. Envie sua primeira mensagem",
    description:
      "Escolha um lead, personalize a abordagem e envie. Depois, acompanhe respostas e próximos passos no CRM.",
    href: "/app/buscar",
    ctaLabel: "Começar agora",
  },
];

export function OnboardingTutorial({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const markDone = useCallback(() => {
    try { localStorage.setItem(TUTORIAL_KEY, "done"); } catch {}
  }, []);

  const pular = useCallback(() => {
    markDone();
    onOpenChange(false);
  }, [markDone, onOpenChange]);

  const avancar = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      markDone();
      onOpenChange(false);
      navigate({ to: "/app/buscar" });
    }
  }, [step, markDone, onOpenChange, navigate]);

  const irParaPasso = useCallback(() => {
    markDone();
    onOpenChange(false);
    navigate({ to: STEPS[step].href });
  }, [step, markDone, onOpenChange, navigate]);

  const ultimo = step === STEPS.length - 1;
  const primeiro = step === 0;
  const atual = STEPS[step];
  const StepIcon = atual.icon;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && pular()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg p-0 overflow-hidden max-h-[92dvh] flex flex-col sm:w-full gap-0">
        {/* Header */}
        <DialogHeader className="relative p-4 sm:p-5 pb-3 shrink-0 border-b border-border bg-gradient-to-br from-primary/5 via-background to-background">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-primary">
              <Zap className="h-3 w-3" /> Tour ZapScout
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {step + 1}/{STEPS.length}
            </span>
          </div>
          <DialogTitle className="sr-only">Tutorial ZapScout</DialogTitle>
          {/* Progress */}
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Ir para o passo ${i + 1}`}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  i < step
                    ? "bg-primary"
                    : i === step
                    ? "bg-primary"
                    : "bg-border hover:bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="px-4 sm:px-6 py-5 overflow-y-auto overscroll-contain flex-1 min-h-0">
          <div className="flex flex-col items-center text-center">
            <div className="grid place-items-center h-14 w-14 rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow mb-4">
              <StepIcon className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold mb-2 leading-tight">{atual.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
              {atual.description}
            </p>
          </div>

          {atual.bullets && atual.bullets.length > 0 && (
            <ul className="mt-5 space-y-2">
              {atual.bullets.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm rounded-lg border border-border/60 bg-card/40 px-3 py-2"
                >
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span className="text-foreground/90">{b}</span>
                </li>
              ))}
            </ul>
          )}

          {atual.tip && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs text-foreground/80">
              <Zap className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span>{atual.tip}</span>
            </div>
          )}

          {!primeiro && (
            <div className="mt-5">
              <Button variant="outline" size="sm" className="w-full" onClick={irParaPasso}>
                {atual.ctaLabel ?? "Ir para esta página"}
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-background px-4 sm:px-6 py-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={pular}
            className="text-muted-foreground hover:text-foreground"
          >
            <SkipForward className="h-3.5 w-3.5 mr-1" /> Pular
          </Button>
          <div className="flex-1" />
          {step > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => Math.max(s - 1, 0))}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Voltar
            </Button>
          )}
          <Button size="sm" onClick={avancar} className="bg-gradient-primary">
            {ultimo ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1" /> Começar
              </>
            ) : (
              <>
                Próximo <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
