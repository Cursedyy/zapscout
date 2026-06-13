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
  Flame,
  BarChart3,
  Check,
  SkipForward,
  ChevronRight,
} from "lucide-react";

export const TUTORIAL_KEY = "zs_tutorial_v3";

interface Step {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
}

const STEPS: Step[] = [
  {
    icon: Rocket,
    title: "Bem-vindo ao ZapScout 🚀",
    description:
      "Sua máquina automática de prospecção via WhatsApp. Em poucos minutos você estará encontrando clientes e enviando mensagens automaticamente.",
    href: "/app",
  },
  {
    icon: Search,
    title: "Buscar leads",
    description:
      "Vá em 'Buscar leads', digite o nicho (ex: clínica, restaurante, academia) e a cidade. O ZapScout busca negócios reais no Google Maps com telefone, avaliação e endereço. Clique em 'Salvar busca' para adicionar ao CRM.",
    href: "/app/buscar",
  },
  {
    icon: Smartphone,
    title: "Conectar WhatsApp",
    description:
      "Vá em 'WhatsApp' no menu. Clique em 'Usar minha API Key' e insira as credenciais da sua instância UazAPI. Sem isso nenhuma mensagem será enviada.",
    href: "/app/whatsapp",
  },
  {
    icon: FileText,
    title: "Templates de mensagem",
    description:
      "Vá em 'Templates' e escolha um pronto ou crie o seu. Use variáveis como {{nome}}, {{cidade}}, {{empresa}} para personalizar automaticamente cada mensagem.",
    href: "/app/templates",
  },
  {
    icon: Send,
    title: "Criar campanha",
    description:
      "Vá em 'Campanhas' → 'Nova campanha'. Escolha um template, defina filtros de nicho/cidade, limite por hora e dispare para todos os leads do CRM automaticamente.",
    href: "/app/campanhas/nova",
  },
  {
    icon: Repeat,
    title: "Follow-ups automáticos",
    description:
      "Configure sequências em 'Sequências' para enviar mensagens de acompanhamento automaticamente nos dias seguintes sem precisar fazer nada manualmente.",
    href: "/app/sequencias",
  },
  {
    icon: Flame,
    title: "Aquecer seu número",
    description:
      "Em 'WhatsApp', ative o Aquecimento de número para evitar bloqueios. O sistema envia mensagens simuladas crescentes para preparar seu chip.",
    href: "/app/whatsapp",
  },
  {
    icon: BarChart3,
    title: "Acompanhar resultados",
    description:
      "Em 'Relatórios' veja leads contatados, taxa de resposta e conversões. No CRM em 'Meus leads' mova os leads pelo funil conforme evoluem.",
    href: "/app/relatorios",
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
  const StepIcon = STEPS[step].icon;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && pular()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg p-0 overflow-hidden max-h-[90dvh] flex flex-col sm:w-full">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-6 pb-3 shrink-0 border-b border-border">
          <DialogTitle className="text-center text-lg font-semibold">
            Tutorial ZapScout
          </DialogTitle>
          <p className="text-center text-xs text-muted-foreground mt-1">
            Passo {step + 1} de {STEPS.length}
          </p>
          {/* Progress */}
          <div className="flex gap-1 mt-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="px-4 sm:px-6 py-5 overflow-y-auto overscroll-contain flex-1 min-h-0">
          <div className="flex flex-col items-center text-center">
            <div className="grid place-items-center h-16 w-16 rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow mb-4">
              <StepIcon className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold mb-2">{STEPS[step].title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
              {STEPS[step].description}
            </p>
          </div>

          {!primeiro && (
            <div className="mt-5">
              <Button variant="outline" size="sm" className="w-full" onClick={irParaPasso}>
                Ir para esta página
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-background px-4 sm:px-6 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={pular} className="text-muted-foreground hover:text-foreground">
            <SkipForward className="h-3.5 w-3.5 mr-1" /> Pular
          </Button>
          <div className="flex-1" />
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={() => setStep((s) => Math.max(s - 1, 0))}>
              Voltar
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
