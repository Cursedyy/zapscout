import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { Search, KanbanSquare, MessageSquare, BarChart3, Settings, LogOut, Zap, Menu, X, Sparkles, Clock, Send, Gift, MessageCircle, Repeat, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { usePlano, useStore } from "@/store/app-store";
import { listarVencidos } from "@/lib/followups";
import { WhatsAppStatusPill } from "@/components/whatsapp-status-pill";

const nav = [
  { to: "/app/buscar", label: "Buscar leads", icon: Search, showProgress: true },
  { to: "/app/leads", label: "Meus leads", icon: KanbanSquare },
  { to: "/app/sequencias", label: "Sequências", icon: Repeat },
  { to: "/app/follow-ups", label: "Follow-ups", icon: Clock, showFollowupBadge: true },
  { to: "/app/campanhas", label: "Campanhas", icon: Send, showCampanhasBadge: true },
  { to: "/app/ia-vendas", label: "IA de Vendas", icon: Bot },
  { to: "/app/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/app/templates", label: "Templates", icon: MessageSquare },
  { to: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/app/afiliados", label: "Afiliados", icon: Gift },
  { to: "/app/configuracoes", label: "Configurações", icon: Settings },
];

export function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const plano = usePlano();
  const { buscasUsadas, leads, campanhas, followupDias } = useStore();
  const pct = Math.min(100, (buscasUsadas / plano.buscas_mes) * 100);
  const fuVencidos = useMemo(() => listarVencidos(leads, followupDias).length, [leads, followupDias]);
  const campanhasAtivas = useMemo(
    () => campanhas.filter((c) => c.status === "em_andamento" || c.status === "agendada").length,
    [campanhas],
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <Link
        to="/app"
        onClick={() => {
          onNavigate?.();
          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border hover:bg-sidebar-accent/40 transition-colors"
      >
        <div className="grid place-items-center h-9 w-9 rounded-lg bg-gradient-primary shadow-glow">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <div className="font-display font-bold text-sidebar-foreground" style={{ color: "var(--color-primary-light)" }}>ZapScout</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Prospecte · Conecte · Venda</div>
        </div>
      </Link>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                active
                  ? "bg-gradient-primary-soft text-sidebar-accent-foreground font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] border border-primary/25"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground border border-transparent",
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-gradient-primary"
                />
              )}
              <Icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-primary-glow" : "text-sidebar-foreground/60 group-hover:text-primary-glow")} />
              <span className="flex-1">{item.label}</span>
              {item.showProgress && (
                <span className="text-[10px] text-muted-foreground tabular-nums">{buscasUsadas}/{plano.buscas_mes}</span>
              )}
              {item.showFollowupBadge && fuVencidos > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-warning/20 text-warning tabular-nums">{fuVencidos}</span>
              )}
              {item.showCampanhasBadge && campanhasAtivas > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary tabular-nums">{campanhasAtivas}</span>
              )}
            </Link>
          );
        })}
        {nav[0] && (
          <div className="px-3 pt-1">
            <div className="h-1 rounded-full bg-secondary/50 overflow-hidden">
              <div className="h-full bg-gradient-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-2">
        <WhatsAppStatusPill />
        <div className="rounded-lg bg-card/60 border border-border p-3">
          {authLoading ? (
            <>
              <div className="h-3 w-32 rounded bg-secondary/60 animate-pulse" />
              <div className="h-4 w-20 rounded bg-secondary/60 animate-pulse mt-2" />
            </>
          ) : (
            <>
              <div className="text-xs text-muted-foreground truncate">{user?.email ?? "Conta"}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-medium">Plano {plano.nome}</span>
                {plano.id === "free" && (
                  <Link to="/planos" onClick={onNavigate} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Upgrade
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
        <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/80" onClick={logout}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [openMobile, setOpenMobile] = useState(false);
  return (
    <>
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border sticky top-0 h-screen self-start">
        <SidebarInner />
      </aside>

      <div className="md:hidden fixed top-3 left-3 z-40 hidden">
        <Button size="icon" variant="outline" onClick={() => setOpenMobile(true)} aria-label="Abrir menu">
          <Menu className="h-4 w-4" />
        </Button>
      </div>
      {openMobile && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpenMobile(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 border-r border-sidebar-border">
            <button onClick={() => setOpenMobile(false)} aria-label="Fechar menu" className="absolute right-2 top-3 z-10 grid place-items-center h-8 w-8 rounded-md hover:bg-secondary/50">
              <X className="h-4 w-4" />
            </button>
            <SidebarInner onNavigate={() => setOpenMobile(false)} />
          </div>
        </div>
      )}
    </>
  );
}
