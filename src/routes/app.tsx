import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppMobileTopbar } from "@/components/app-mobile-topbar";
import { FollowupsBanner } from "@/components/followups-banner";
import { FilaAlertsWatcher } from "@/components/fila-alerts-watcher";
import { useLeadsRealtime } from "@/hooks/use-leads-realtime";

import { supabase } from "@/integrations/supabase/client";
import { AppStoreProvider } from "@/store/app-store";
import { OnboardingTutorial, TUTORIAL_KEY } from "@/components/onboarding-tutorial";
import { HelpButton } from "@/components/help-drawer";
import { FeedbackButton } from "@/components/feedback-button";

export const Route = createFileRoute("/app")({
  // Sem beforeLoad de auth aqui: o gate é client-side dentro do AppLayout.
  // Fazer redirect em beforeLoad cria loop /app -> /login -> /app logo após
  // o signInWithPassword (storage adapter ainda não persistiu a sessão),
  // o que o router surface como "This page didn't load".
  component: AppLayout,
});

/**
 * Gate client-side: aguarda a sessão do Supabase ficar legível e só então
 * renderiza o app. Se após o timeout não houver sessão, manda pro /login.
 * Funciona igual para qualquer plano (dono / free / pro / agencia / business).
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  // null = ainda verificando, true = autenticado, false = sem sessão
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    // 1) Listener: qualquer mudança de sessão atualiza o gate na hora.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (cancelled) return;
      setAuthed(!!session);
    });

    // 2) Polling curto com timeout — cobre a janela em que o storage adapter
    //    ainda não terminou de gravar a sessão logo após o signIn.
    (async () => {
      const start = Date.now();
      const TIMEOUT_MS = 4000;
      while (!cancelled && Date.now() - start < TIMEOUT_MS) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          setAuthed(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      if (!cancelled) setAuthed(false);
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authed === false) {
      navigate({ to: "/login", replace: true });
    }
  }, [authed, navigate]);

  if (authed !== true) {
    return (
      <div className="min-h-dvh grid place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm">Carregando seu painel…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AppLayout() {
  const location = useLocation();
  const [showTutorial, setShowTutorial] = useState(false);
  // Assina mudanças em `leads` para atualizar as colunas do CRM em tempo real
  // quando cron/IA mudam o status de um lead.
  useLeadsRealtime();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(TUTORIAL_KEY);
    if (!done && location.pathname === "/app") {
      setShowTutorial(true);
    }
  }, [location.pathname]);

  // Permite reabrir o tutorial via botão "Ver tutorial completo" no help drawer.
  useEffect(() => {
    const handler = () => setShowTutorial(true);
    window.addEventListener("zs:open-tutorial", handler);
    return () => window.removeEventListener("zs:open-tutorial", handler);
  }, []);

  return (
    <AuthGate>
      <AppStoreProvider>
        <div className="flex min-h-dvh bg-background">
          <AppSidebar />
          <main className="flex-1 min-w-0 flex flex-col">
            <AppMobileTopbar />
            <FollowupsBanner />
            <div className="flex-1 min-w-0">
              <Outlet />
            </div>
          </main>
        </div>
        <HelpButton />
        <FeedbackButton />
        <FilaAlertsWatcher />
        <OnboardingTutorial open={showTutorial} onOpenChange={setShowTutorial} />
      </AppStoreProvider>
    </AuthGate>
  );
}
