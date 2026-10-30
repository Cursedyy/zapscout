import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { BarChart3, KanbanSquare, Users, LayoutDashboard, Loader2, LogOut, Send, TrendingDown, ShieldAlert, Upload, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { obterAcessoMimo } from "@/lib/mimo.functions";
import { ROTULO_PAPEL } from "@/lib/mimo-acesso";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mimo")({
  beforeLoad: async () => ({ mimoAcesso: await obterAcessoMimo() }),
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  pendingComponent: () => <Carregando texto="Verificando seu acesso…" />,
  errorComponent: () => <AcessoNegado />,
  notFoundComponent: () => <AcessoNegado />,
  component: MimoLayout,
});

const nav = [
  { to: "/mimo", label: "Dashboard", icon: LayoutDashboard },
  { to: "/mimo/leads", label: "Leads", icon: KanbanSquare },
  { to: "/mimo/tira-pedido", label: "Tira-pedido", icon: ClipboardList },
  { to: "/mimo/campanhas", label: "Campanhas", icon: Send },
  { to: "/mimo/meta-ads", label: "Meta Ads", icon: Upload },
  { to: "/mimo/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/mimo/perdas", label: "Perdas", icon: TrendingDown },
  { to: "/mimo/equipe", label: "Equipe", icon: Users },
] as const;

function Carregando({ texto }: { texto: string }) {
  return (
    <div className="mimo-app grid min-h-dvh place-items-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm">{texto}</p>
      </div>
    </div>
  );
}

function AcessoNegado() {
  return (
      <main className="mimo-app grid min-h-dvh place-items-center bg-background p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-2xl font-semibold">Acesso negado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta não tem permissão para acessar esta área.
          </p>
          <Button asChild className="mt-6">
            <Link to="/app">Voltar ao ZapScout</Link>
          </Button>
        </div>
      </main>
  );
}

function MimoLayout() {
  const { mimoAcesso } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sair = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("mimo-app");
    return () => el.classList.remove("mimo-app");
  }, []);
  if (!mimoAcesso.autorizado) return <AcessoNegado />;
  const { nome, papel, empresa } = mimoAcesso;
  return (
    <div className="mimo-app flex min-h-dvh flex-col bg-background md:flex-row">
      <aside className="border-b border-sidebar-border bg-sidebar md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:flex-col md:border-b-0 md:border-r">
        <div className="border-b border-sidebar-border px-5 py-4">
          <p className="font-display text-2xl leading-none tracking-tight text-secondary-foreground">
            MiMo<span className="text-primary">.</span>
          </p>
          <p className="mt-1 font-display text-sm italic leading-tight text-primary">Esse Pode!</p>
          <p className="mt-2 text-xs text-muted-foreground">{empresa} · Ambiente comercial</p>
        </div>
        <nav aria-label="Navegação MiMo" className="flex gap-1 overflow-x-auto px-3 py-3 md:flex-1 md:flex-col">
          {nav.map(({ to, label, icon: Icon }) => {
            const ativo = to === "/mimo" ? pathname === to || pathname === "/mimo/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  ativo ? "bg-primary/15 font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
                )}
              >
                <Icon className={cn("h-[18px] w-[18px]", ativo ? "text-primary-glow" : "text-sidebar-foreground/55")} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden border-t border-sidebar-border p-3 md:block">
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <p className="truncate text-sm font-medium">{nome}</p>
            <p className="mt-1 text-xs text-primary-glow">{ROTULO_PAPEL[papel]}</p>
          </div>
          <Button variant="ghost" className="mt-2 w-full justify-start" onClick={sair}>
            <LogOut /> Sair
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{nome}</p><p className="text-xs text-primary-glow">{ROTULO_PAPEL[papel]}</p></div>
          <Button variant="ghost" size="icon" onClick={sair} aria-label="Sair"><LogOut /></Button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}