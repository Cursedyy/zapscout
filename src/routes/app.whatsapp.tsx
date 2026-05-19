import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MessageCircle, QrCode, RefreshCw, LogOut, CheckCircle2, Loader2 } from "lucide-react";
import { connectWhatsApp, statusWhatsApp, disconnectWhatsApp } from "@/lib/whatsapp.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: WhatsAppPage,
});

function WhatsAppPage() {
  const router = useRouter();
  const connect = useServerFn(connectWhatsApp);
  const status = useServerFn(statusWhatsApp);
  const disconnect = useServerFn(disconnectWhatsApp);

  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [estado, setEstado] = useState<string>("desconectado");
  const [numero, setNumero] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await status();
      setEstado(s.status);
      setNumero(s.numero ?? null);
      if (s.qrcode) setQr(s.qrcode);
      if (s.status === "connected") setQr(null);
    } catch (e) {
      console.error(e);
    }
  }, [status]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const r = await connect();
      setEstado(r.status);
      if (r.qrcode) setQr(r.qrcode);
      toast.success("QR Code gerado. Escaneie pelo WhatsApp.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao conectar");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await disconnect();
      setEstado("desconectado");
      setQr(null);
      setNumero(null);
      toast.success("WhatsApp desconectado");
      router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao desconectar");
    } finally {
      setLoading(false);
    }
  };

  const isConnected = estado === "connected";
  const isConnecting = estado === "connecting" || estado === "qrcode";

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <PageHeader title="WhatsApp" subtitle="Conecte seu número para envio real automatizado (via UAZAPI)." />

      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className={`grid place-items-center h-16 w-16 rounded-2xl mx-auto mb-4 ${isConnected ? "bg-success/15 text-success" : "bg-primary/15 text-primary"}`}>
          {isConnected ? <CheckCircle2 className="h-8 w-8" /> : <MessageCircle className="h-8 w-8" />}
        </div>

        {isConnected ? (
          <>
            <h2 className="font-semibold text-lg mb-1">Conectado</h2>
            <p className="text-sm text-muted-foreground mb-2">Número ativo:</p>
            <p className="text-lg font-mono mb-6">+{numero}</p>
            <Button variant="outline" onClick={handleDisconnect} disabled={loading}>
              <LogOut className="h-4 w-4 mr-2" /> Desconectar
            </Button>
          </>
        ) : (
          <>
            <h2 className="font-semibold text-lg mb-1">
              {isConnecting ? "Aguardando leitura do QR" : "Nenhuma conexão ativa"}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {isConnecting
                ? "Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho."
                : "Clique em Gerar QR Code e leia com seu WhatsApp."}
            </p>

            <div className="mx-auto h-56 w-56 rounded-xl border-2 border-dashed border-border grid place-items-center mb-6 overflow-hidden bg-background">
              {qr ? (
                <img
                  src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                  alt="QR Code WhatsApp"
                  className="h-full w-full object-contain"
                />
              ) : isConnecting ? (
                <Loader2 className="h-12 w-12 text-muted-foreground animate-spin" />
              ) : (
                <QrCode className="h-16 w-16 text-muted-foreground" />
              )}
            </div>

            <div className="flex justify-center gap-2">
              <Button onClick={handleConnect} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
                {qr ? "Gerar novo QR" : "Gerar QR Code"}
              </Button>
              <Button variant="outline" onClick={refresh} disabled={loading}>
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
              </Button>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground mt-6">
          Status: <span className="font-mono">{estado}</span> · Provider: UAZAPI
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <strong className="text-foreground">Como funciona:</strong> ao escanear o QR, sua instância UAZAPI fica conectada
        24/7. As campanhas e cadências de follow-up rodam em servidor — você não precisa deixar o navegador aberto.
        Respostas dos leads pausam automaticamente a cadência via webhook.
      </div>
    </div>
  );
}
