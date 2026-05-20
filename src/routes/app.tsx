import { createFileRoute, Outlet, redirect, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppMobileTopbar } from "@/components/app-mobile-topbar";
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

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onboarded = localStorage.getItem("zs_onboarded");
    // Só redireciona para onboarding na rota raiz /app e quando o usuário
    // realmente nunca passou pelo onboarding. Em qualquer subrota deixa passar.
    if (!onboarded && location.pathname === "/app") {
      navigate({ to: "/app/onboarding", replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <AppStoreProvider>
      <div className="flex min-h-dvh bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <AppMobileTopbar />
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </AppStoreProvider>
  );
}

