import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Search,
  Smartphone,
  FileText,
  Rocket,
  BarChart3,
  Check,
  SkipForward,
  ChevronRight,
  Languages,
} from "lucide-react";

export const TUTORIAL_KEY = "zs_tutorial_v2";
export const TUTORIAL_LANG_KEY = "zs_tutorial_lang";

type Lang = "pt-BR" | "en" | "es";

const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "pt-BR", label: "PT", flag: "🇧🇷" },
  { code: "en", label: "EN", flag: "🇺🇸" },
  { code: "es", label: "ES", flag: "🇪🇸" },
];

interface Step {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
}

const STEPS_BY_LANG: Record<Lang, Step[]> = {
  "pt-BR": [
    { icon: Search, title: "Buscar leads", description: "Encontre negócios no Google Maps por nicho e cidade", href: "/app/buscar" },
    { icon: Smartphone, title: "Conectar WhatsApp", description: "Conecte seu número para disparar mensagens", href: "/app/whatsapp" },
    { icon: FileText, title: "Criar template", description: "Escreva sua mensagem de prospecção", href: "/app/templates" },
    { icon: Rocket, title: "Criar campanha", description: "Dispare para vários leads automaticamente", href: "/app/campanhas/nova" },
    { icon: BarChart3, title: "Acompanhar resultados", description: "Veja respostas e conversões nos Relatórios", href: "/app/relatorios" },
  ],
  en: [
    { icon: Search, title: "Find leads", description: "Discover businesses on Google Maps by niche and city", href: "/app/buscar" },
    { icon: Smartphone, title: "Connect WhatsApp", description: "Link your number to send messages", href: "/app/whatsapp" },
    { icon: FileText, title: "Create template", description: "Write your outreach message", href: "/app/templates" },
    { icon: Rocket, title: "Create campaign", description: "Send to multiple leads automatically", href: "/app/campanhas/nova" },
    { icon: BarChart3, title: "Track results", description: "See replies and conversions in Reports", href: "/app/relatorios" },
  ],
  es: [
    { icon: Search, title: "Buscar leads", description: "Encuentra negocios en Google Maps por nicho y ciudad", href: "/app/buscar" },
    { icon: Smartphone, title: "Conectar WhatsApp", description: "Conecta tu número para enviar mensajes", href: "/app/whatsapp" },
    { icon: FileText, title: "Crear plantilla", description: "Escribe tu mensaje de prospección", href: "/app/templates" },
    { icon: Rocket, title: "Crear campaña", description: "Envía a varios leads automáticamente", href: "/app/campanhas/nova" },
    { icon: BarChart3, title: "Seguir resultados", description: "Ve respuestas y conversiones en Informes", href: "/app/relatorios" },
  ],
};

const T: Record<Lang, {
  welcome: string; subtitle: string; step: string; of: string;
  goTo: string; skip: string; back: string; next: string; start: string;
}> = {
  "pt-BR": {
    welcome: "Bem-vindo ao ZapScout",
    subtitle: "5 passos para começar a prospectar",
    step: "Passo", of: "de",
    goTo: "Ir para", skip: "Pular tutorial", back: "Voltar", next: "Próximo", start: "Começar agora",
  },
  en: {
    welcome: "Welcome to ZapScout",
    subtitle: "5 steps to start prospecting",
    step: "Step", of: "of",
    goTo: "Go to", skip: "Skip tutorial", back: "Back", next: "Next", start: "Start now",
  },
  es: {
    welcome: "Bienvenido a ZapScout",
    subtitle: "5 pasos para empezar a prospectar",
    step: "Paso", of: "de",
    goTo: "Ir a", skip: "Omitir tutorial", back: "Atrás", next: "Siguiente", start: "Empezar ahora",
  },
};

function getInitialLang(): Lang {
  if (typeof window === "undefined") return "pt-BR";
  try {
    const saved = localStorage.getItem(TUTORIAL_LANG_KEY) as Lang | null;
    if (saved && (saved === "pt-BR" || saved === "en" || saved === "es")) return saved;
  } catch {}
  return "pt-BR";
}

export function OnboardingTutorial({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<Lang>("pt-BR");

  useEffect(() => {
    setLang(getInitialLang());
  }, []);

  const STEPS = STEPS_BY_LANG[lang];
  const t = T[lang];

  const trocarIdioma = useCallback((novo: Lang) => {
    setLang(novo);
    try {
      localStorage.setItem(TUTORIAL_LANG_KEY, novo);
    } catch {}
  }, []);

  const markDone = useCallback(() => {
    try {
      localStorage.setItem(TUTORIAL_KEY, "done");
    } catch {}
  }, []);

  const fechar = useCallback(() => {
    markDone();
    onOpenChange(false);
  }, [markDone, onOpenChange]);

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
  }, [step, STEPS.length, markDone, onOpenChange, navigate]);

  const selecionarPasso = useCallback((index: number) => {
    setStep(index);
  }, []);

  const ultimo = step === STEPS.length - 1;
  const StepIcon = STEPS[step].icon;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && pular()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Languages className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => trocarIdioma(l.code)}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                    lang === l.code
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label={`Idioma ${l.label}`}
                >
                  <span>{l.flag}</span>
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          </div>
          <DialogTitle className="text-center text-xl font-semibold">
            {t.welcome}
          </DialogTitle>
          <p className="text-center text-sm text-muted-foreground mt-1">
            {t.subtitle}
          </p>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5">
          {/* Progress bar + indicator */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t.step} {step + 1} {t.of} {STEPS.length}</span>
              <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
            </div>
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className="flex-1 h-1.5 rounded-full transition-colors duration-300"
                  style={{
                    background:
                      i <= step
                        ? "var(--color-primary, #7C5CFF)"
                        : "var(--color-border, #E2E8F0)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Step cards */}
          <div className="space-y-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isPast = i < step;
              return (
                <button
                  key={i}
                  onClick={() => selecionarPasso(i)}
                  className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                    isActive
                      ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                      : isPast
                      ? "border-border/60 bg-secondary/30 opacity-80"
                      : "border-border bg-card hover:bg-secondary/40"
                  }`}
                >
                  <div
                    className={`shrink-0 grid place-items-center h-10 w-10 rounded-lg transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isPast
                        ? "bg-primary/20 text-primary"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {isPast ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          isActive ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {s.title}
                      </span>
                      {isActive && (
                        <ChevronRight className="h-3.5 w-3.5 text-primary animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active step detail */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="shrink-0 grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary">
                <StepIcon className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-medium">{STEPS[step].title}</p>
                <p className="text-xs text-muted-foreground">
                  {STEPS[step].description}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-1"
              onClick={() => {
                markDone();
                onOpenChange(false);
                navigate({ to: STEPS[step].href });
              }}
            >
              {t.goTo} {STEPS[step].title}
            </Button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <Button variant="ghost" size="sm" onClick={pular} className="text-muted-foreground hover:text-foreground">
              <SkipForward className="h-3.5 w-3.5 mr-1" /> {t.skip}
            </Button>
            <div className="flex-1" />
            {step > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => Math.max(s - 1, 0))}
              >
                {t.back}
              </Button>
            )}
            <Button size="sm" onClick={avancar} className="bg-gradient-primary">
              {ultimo ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1" /> {t.start}
                </>
              ) : (
                <>
                  {t.next} <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
