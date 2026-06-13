import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Search, Send, MessageSquare, KanbanSquare, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SidebarInner } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

const quickNav = [
  { to: "/app/buscar", label: "Prospector", icon: Search },
  { to: "/app/campanhas", label: "Campanhas", icon: Send },
  { to: "/app/templates", label: "WhatsApp", icon: MessageSquare },
  { to: "/app/leads", label: "CRM", icon: KanbanSquare },
];

export function AppMobileTopbar() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <div className="md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
      <div className="flex items-center gap-2 px-3 h-12">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 max-w-[80vw]">
            <SidebarInner onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <Link
          to="/app"
          className="flex items-center gap-2 min-w-0"
          onClick={() => {
            if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <div className="grid place-items-center h-7 w-7 rounded-md bg-gradient-primary shadow-glow shrink-0">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-sm truncate" style={{ color: "var(--color-primary-light)" }}>
            ZapScout
          </span>
        </Link>

        <div className="ml-auto">
          <NotificationBell />
        </div>
      </div>

      <nav className="flex items-stretch overflow-x-auto no-scrollbar border-t border-border">
        {quickNav.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex-1 min-w-[80px] flex flex-col items-center justify-center gap-0.5 px-3 py-2 text-[11px] font-medium transition-colors border-b-2",
                active
                  ? "text-primary border-primary bg-primary/5"
                  : "text-muted-foreground border-transparent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
