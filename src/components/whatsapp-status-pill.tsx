import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { getWhatsAppConfig } from "@/lib/whatsapp.functions";

export function WhatsAppStatusPill() {
  const fn = useServerFn(getWhatsAppConfig);
  const { data } = useQuery({
    queryKey: ["wa-config"],
    queryFn: () => fn(),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const connected = !!data?.connected;
  const providerLabel =
    data?.provider === "uazapi"
      ? "UazAPI"
      : data?.provider === "evolution"
        ? "Evolution"
        : data?.provider === "meta"
          ? "Meta"
          : null;
  const numero = data?.numero ?? null;

  return (
    <Link
      to="/app/whatsapp"
      className="block rounded-lg border border-border bg-card/60 p-3 hover:bg-sidebar-accent/40 transition-colors"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="relative inline-flex h-2.5 w-2.5">
          {connected && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-success" : "bg-destructive"}`}
          />
        </span>
        <span className="font-medium text-foreground">WhatsApp</span>
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          <MessageCircle className="h-3 w-3" />
          {providerLabel ?? "—"}
        </span>
      </div>
      {connected ? (
        <div className="mt-1 text-[11px] text-muted-foreground truncate">
          {numero ? `+${numero}` : "Conectado"}
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-primary">Conectar agora →</div>
      )}
    </Link>
  );
}
