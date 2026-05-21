import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search, MessageCircle, Send, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePlano } from "@/store/app-store";

const SEEN_KEY_PREFIX = "zapscout:welcome-seen:";

export function WelcomeModal() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { welcome?: string };
  const { user } = useAuth();
  const plano = usePlano();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (search?.welcome !== "true") return;
    if (!user?.id) return;
    const key = `${SEEN_KEY_PREFIX}${user.id}`;
    let alreadySeen = false;
    try {
      alreadySeen = localStorage.getItem(key) === "1";
    } catch {}
    if (alreadySeen) {
      // Limpa o parâmetro para não reabrir em futuras visitas
      navigate({ to: "/app", replace: true });
      return;
    }
    setOpen(true);
  }, [search?.welcome, user?.id, navigate]);

  const fechar = () => {
    setOpen(false);
    if (user?.id) {
      try {
        localStorage.setItem(`${SEEN_KEY_PREFIX}${user.id}`, "1");
      } catch {}
    }
    navigate({ to: "/app", replace: true });
  };

  const nome = (user?.user_metadata?.nome as string | undefined) ?? user?.email?.split("@")[0] ?? "";

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? fechar() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="h-6 w-6 text-primary" /> Bem-vindo{nome ? `, ${nome}` : ""}!
          </DialogTitle>
          <DialogDescription>
            Seu plano <span className="font-semibold text-foreground">{plano.nome}</span> está ativo. Veja por onde começar:
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 py-2">
          <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
            <Search className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <div className="text-sm font-medium">Buscar seus primeiros leads</div>
              <div className="text-xs text-muted-foreground">Encontre negócios no Google Maps por nicho e cidade.</div>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
            <MessageCircle className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <div className="text-sm font-medium">Conectar seu WhatsApp</div>
              <div className="text-xs text-muted-foreground">Escaneie o QR code e dispare mensagens em segundos.</div>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
            <Send className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <div className="text-sm font-medium">Criar sua primeira campanha</div>
              <div className="text-xs text-muted-foreground">Modo Campanha monta tudo em 3 cliques.</div>
            </div>
          </li>
        </ul>

        <DialogFooter>
          <Button onClick={fechar} className="w-full bg-gradient-primary">
            <Search className="h-4 w-4" /> Começar a prospectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
