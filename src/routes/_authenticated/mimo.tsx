import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { MimoCarregando } from "@/components/mimo-carregando";
import { NotificationBell } from "@/components/notification-bell";
import { MimoFeedbackButton } from "@/components/mimo-feedback-button";
import { MimoLeadsEspera } from "@/components/mimo-leads-espera";
import { useMimoPreload } from "@/lib/use-mimo-preload";
import { limparRascunhosMemoria } from "@/lib/mimo-rascunho-memoria";
import {
  BarChart3,
  ChevronDown,
  KanbanSquare,
  Users,
  Instagram,
  ImageUp,
  Handshake,
  LayoutDashboard,
  Loader2,
  LogOut,
  Workflow,
  TrendingDown,
  ShieldAlert,
  Upload,
  ClipboardList,
  MessageCircle,
  Network,
  BriefcaseBusiness,
  Megaphone,
  MessageSquare,
  Truck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { obterAcessoMimo } from "@/lib/mimo.functions";
import {
  ROTULO_PAPEL,
  PAGINAS_POR_PAPEL,
  podeAbrirPagina,
  type AcessoMimo,
} from "@/lib/mimo-acesso";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MimoFeedbackNavIndicator } from "@/components/mimo-feedback-nav-indicator";

export const Route = createFileRoute("/_authenticated/mimo")({
  beforeLoad: async () => ({ mimoAcesso: await obterAcessoMimo() }),
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  pendingComponent: () => <Carregando texto="Verificando seu acesso…" />,
  errorComponent: () => <AcessoNegado />,
  notFoundComponent: () => <AcessoNegado />,
  component: MimoLayout,
});

const nav = [
  { to: "/mimo/influenciadores", label: "Influenciadores MiMo", icon: Instagram },
  { to: "/mimo/representantes", label: "Representantes MiMo", icon: Handshake },
  { to: "/mimo/arvore-comercial", label: "Árvore Comercial", icon: Network },
  { to: "/mimo", label: "Dashboard", icon: LayoutDashboard },
  { to: "/mimo/leads", label: "Leads", icon: KanbanSquare },
  { to: "/mimo/carteira", label: "Carteira", icon: BriefcaseBusiness },
  { to: "/mimo/tira-pedido", label: "Tira-pedido", icon: ClipboardList },
  { to: "/mimo/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/mimo/rastreamento", label: "Rastreamento", icon: Truck },
  { to: "/mimo/omie", label: "OMIE · CFOP", icon: ClipboardList },
  { to: "/mimo/automacoes", label: "Automações", icon: Workflow },
  {
    to: "/mimo/campanhas",
    label: "Campanhas",
    icon: Megaphone,
    submenu: { to: "/mimo/campanha-desenhos", label: "Campanha de desenhos", icon: ImageUp },
  },
  { to: "/mimo/meta-ads", label: "Meta Ads", icon: Upload },
  { to: "/mimo/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/mimo/perdas", label: "Perdas", icon: TrendingDown },
  { to: "/mimo/equipe", label: "Equipe", icon: Users },
  { to: "/mimo/feedbacks", label: "Feedbacks", icon: MessageSquare },
  { to: "/mimo/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/mimo/agente", label: "Agente de atendimento", icon: MessageCircle },
] as const;

type ItemMenu = (typeof nav)[number];
type LinkMenu = ItemMenu | Extract<ItemMenu, { submenu: unknown }>["submenu"];

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
  const { mimoAcesso }: { mimoAcesso: AcessoMimo } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [submenu, setSubmenu] = useState<{ caminho: string; aberto: boolean }>();
  const preload = useMimoPreload(
    mimoAcesso.autorizado ? PAGINAS_POR_PAPEL[mimoAcesso.papel] : [],
    pathname.replace(/\/+$/, "") || "/mimo",
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const navegando = useRouterState({ select: (s) => s.isLoading });
  const sair = async () => {
    preload.cancelar();
    limparRascunhosMemoria();
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
  const caminho = pathname.replace(/\/+$/, "") || "/mimo";
  const permitido = !mimoAcesso.autorizado || podeAbrirPagina(mimoAcesso.papel, caminho);
  useEffect(() => {
    if (mimoAcesso.autorizado && !permitido)
      navigate({ to: PAGINAS_POR_PAPEL[mimoAcesso.papel][0] as "/mimo", replace: true });
  }, [mimoAcesso, permitido, navigate]);
  if (!mimoAcesso.autorizado) return <AcessoNegado />;
  const { nome, papel, empresa } = mimoAcesso;
  const menu = nav.filter((i) => podeAbrirPagina(papel, i.to));

  function renderLink({ to, label, icon: Icon }: LinkMenu, filho = false) {
    const ativo = caminho === to || (to !== "/mimo" && caminho.startsWith(`${to}/`));
    return (
      <Link
        key={to}
        to={to}
        preload={false}
        onPointerEnter={() => preload(to)}
        onFocus={() => preload(to)}
        onTouchStart={() => preload(to)}
        className={cn(
          "flex shrink-0 items-center gap-3 rounded-lg text-sm transition-colors",
          filho ? "px-2 py-2" : "px-3 py-2.5",
          ativo
            ? "bg-primary/15 font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(
            "size-[18px] shrink-0",
            ativo ? "text-primary-glow" : "text-sidebar-foreground/55",
          )}
        />
        {label}
        {to === "/mimo/feedbacks" && (papel === "administrador" || papel === "gestor") && (
          <MimoFeedbackNavIndicator />
        )}
      </Link>
    );
  }

  return (
    <div className="mimo-app flex min-h-dvh flex-col bg-background md:flex-row">
      <aside className="border-b border-sidebar-border bg-sidebar md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:flex-col md:border-b-0 md:border-r">
        <div className="border-b border-sidebar-border px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-2xl leading-none tracking-tight text-secondary-foreground">
              MiMo<span className="text-primary">.</span>
            </p>
            {(papel === "administrador" || papel === "gestor") && <NotificationBell />}
          </div>
          <p className="mt-1 font-display text-sm italic leading-tight text-primary">Esse Pode!</p>
          <p className="mt-2 text-xs text-muted-foreground">{empresa} · Ambiente comercial</p>
        </div>
        <nav
          aria-label="Navegação MiMo"
          className="flex items-start gap-1 overflow-x-auto px-3 py-3 md:flex-1 md:flex-col md:items-stretch"
        >
          {menu.map((item) => {
            if (!("submenu" in item) || !podeAbrirPagina(papel, item.submenu.to))
              return renderLink(item);
            const aberto =
              submenu?.caminho === caminho
                ? submenu.aberto
                : caminho === item.to || caminho === item.submenu.to;
            return (
              <div key={item.to} className="shrink-0">
                <div className="flex items-center justify-between gap-1">
                  {renderLink(item)}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 text-sidebar-foreground/80"
                    aria-label="Submenu de Campanhas"
                    aria-expanded={aberto}
                    aria-controls="mimo-submenu-campanhas"
                    onClick={() => setSubmenu({ caminho, aberto: !aberto })}
                  >
                    <ChevronDown
                      aria-hidden="true"
                      className={cn("transition-transform", aberto && "rotate-180")}
                    />
                  </Button>
                </div>
                <ul
                  id="mimo-submenu-campanhas"
                  hidden={!aberto}
                  className="ml-4 mt-1 border-l border-sidebar-border pl-2"
                >
                  <li>{renderLink(item.submenu, true)}</li>
                </ul>
              </div>
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
        {navegando && (
          <div
            role="progressbar"
            aria-label="Abrindo menu MiMo"
            className="sticky top-0 z-20 h-1 bg-primary motion-safe:animate-pulse"
          />
        )}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{nome}</p>
            <p className="text-xs text-primary-glow">{ROTULO_PAPEL[papel]}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={sair} aria-label="Sair">
            <LogOut />
          </Button>
        </div>
        {permitido ? (
          <Suspense fallback={<MimoCarregando />}>
            <Outlet />
          </Suspense>
        ) : (
          <p className="p-6 text-muted-foreground">Abrindo uma página do seu cargo…</p>
        )}
      </main>
      {podeAbrirPagina(papel, "/mimo/leads") && <MimoLeadsEspera />}
      <MimoFeedbackButton />
    </div>
  );
}
