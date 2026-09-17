import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Smartphone, Search, Send, Check, ArrowRight, Sparkles, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/onboarding")({
  head: () => ({
    meta: [
      { title: "Bem-vindo — ZapScout" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OnboardingPage,
});

const ONBOARDING_KEY = "zs_onboarded";

const STEPS = [
  {
    icon: Smartphone,
    title: "Conecte seu WhatsApp",
    desc: "Aponte a câmera do seu celular para o QR code e conecte sua conta em menos de 30 segundos. Sem perder o seu número.",
    cta: "Conectar WhatsApp",
    href: "/app/whatsapp" as const,
  },
  {
    icon: Search,
    title: "Faça sua primeira busca",
    desc: "Escolha um nicho (ex: clínicas, restaurantes) e uma cidade. A gente vasculha o Google Maps e traz os leads prontos.",
    cta: "Buscar leads",
    href: "/app/buscar" as const,
  },
  {
    icon: Send,
    title: "Dispare sua primeira mensagem",
    desc: "Use um template pronto ou crie o seu. Em um clique você fala com dezenas de clientes em potencial pelo WhatsApp.",
    cta: "Ver templates",
    href: "/app/templates" as const,
  },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const finalizar = () => {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
    navigate({ to: "/app" });
  };

  const atual = STEPS[step];
  const Icon = atual.icon;
  const ultimo = step === STEPS.length - 1;

  return (
    <div className="min-h-dvh p-4 sm:p-6 md:p-10 flex items-center justify-center">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-mono mb-4">
            <Sparkles className="h-3 w-3" /> Tour rápido — 3 passos
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">Bem-vindo ao ZapScout</h1>
          <p className="text-muted-foreground">Em menos de 5 minutos você dispara sua primeira campanha.</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-border">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: i <= step ? "100%" : "0%",
                  background: "var(--color-primary)",
                }}
              />
            </div>
          ))}
        </div>

        {/* Step card */}
        <div className="rounded-2xl border border-border bg-card p-6 md:p-10">
          <div className="flex items-start gap-4 mb-6">
            <div
              className="shrink-0 grid place-items-center h-14 w-14 rounded-2xl text-white"
              style={{
                background: "var(--gradient-primary, var(--color-primary))",
                boxShadow: "0 10px 30px -10px var(--color-primary)",
              }}
            >
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-muted-foreground mb-1">
                Passo {step + 1} de {STEPS.length}
              </div>
              <h2 className="font-display text-2xl font-semibold mb-2">{atual.title}</h2>
              <p className="text-muted-foreground leading-relaxed">{atual.desc}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button asChild size="lg" className="flex-1 bg-gradient-primary">
              <Link to={atual.href}>
                {atual.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {ultimo ? (
              <Button size="lg" variant="outline" onClick={finalizar}>
                <Check className="h-4 w-4" /> Concluir
              </Button>
            ) : (
              <Button size="lg" variant="outline" onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}>
                Próximo passo
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-6 text-sm">
          <button
            onClick={() => setStep((s) => Math.max(s - 1, 0))}
            disabled={step === 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Voltar
          </button>
          <button
            onClick={finalizar}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <SkipForward className="h-3.5 w-3.5" /> Pular tour
          </button>
        </div>
      </div>
    </div>
  );
}
