import { createFileRoute, Outlet, redirect, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppMobileTopbar } from "@/components/app-mobile-topbar";
import { FollowupsBanner } from "@/components/followups-banner";
import { NotificationsBell } from "@/components/notifications-bell";

import { supabase } from "@/integrations/supabase/client";
import { AppStoreProvider } from "@/store/app-store";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    // Só checa sessão no client — no SSR não há localStorage,
    // então o getSession sempre retorna null e redirecionaria pro /login
    // a cada refresh/navegação, derrubando o usuário.
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

import { OnboardingTutorial, TUTORIAL_KEY } from "@/components/onboarding-tutorial";

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(TUTORIAL_KEY);
    const onboarded = localStorage.getItem("zs_onboarded");
    // Mostra tutorial na primeira vez que entra no app (tanto para usuários novos quanto os que já fizeram onboarding antigo)
    if (!done && location.pathname === "/app") {
      setShowTutorial(true);
    }
    // Mantém compatibilidade: se o usuário já fez onboarding mas nunca viu o tutorial novo,
    // marca como visto para não incomodar usuários antigos
    if (onboarded && !done) {
      try { localStorage.setItem(TUTORIAL_KEY, "done"); } catch {}
    }
  }, [location.pathname]);

  return (
    <AppStoreProvider>
      <div className="flex min-h-dvh bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <AppMobileTopbar />
          <div className="hidden md:flex sticky top-0 z-30 h-12 items-center justify-end gap-2 px-6 border-b border-border bg-background/95 backdrop-blur">
            <NotificationsBell />
          </div>
          <FollowupsBanner />
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
      <OnboardingTutorial open={showTutorial} onOpenChange={setShowTutorial} />
    </AppStoreProvider>
  );
}

