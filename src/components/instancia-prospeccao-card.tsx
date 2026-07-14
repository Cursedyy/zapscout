import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QrCode, RefreshCw, Loader2, LogOut } from "lucide-react";
import {
  criarInstanciaExtra,
  statusInstanciaExtra,
  desconectarInstanciaExtra,
} from "@/lib/uazapi-instancias.functions";
import { mensagemErro, toastErro } from "@/lib/traduzir-erro";

/**
 * Instância UazAPI dedicada à prospecção (número separado da instância
 * principal, usada pelo agente de IA para responder leads de campanhas
 * de prospecção ativa).
 */
export function InstanciaProspeccaoCard() {
  const criar = useServerFn(criarInstanciaExtra);
  const status = useServerFn(statusInstanciaExtra);
  const desconectar = useServerFn(desconectarInstanciaExtra);

  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [estado, setEstado] = useState<string>("desconectado");
  const [numero, setNumero] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await status({ data: { tipo: "prospeccao" } });
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
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const r = await criar({ data: { tipo: "prospeccao" } });
      setEstado(r.status);
      if (r.qrcode) setQr(r.qrcode);
      toast.success("QR Code gerado. Escaneie com o número dedicado à prospecção.");
    } catch (e) {
      toastErro(e, "Falha ao conectar instância de prospecção");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await desconectar({ data: { tipo: "prospeccao" } });
      setQr(null);
      setEstado("desconectado");
      toast.success("Instância de prospecção desconectada");
    } catch (e) {
      toast.error(mensagemErro(e, "Falha ao desconectar"));
    } finally {
      setLoading(false);
    }
  };

  const conectado = estado === "connected";

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">Instância de prospecção</h3>
          <p className="text-xs text-muted-foreground">
            Número separado, dedicado ao agente de IA respondendo leads de campanhas ativas.
          </p>
        </div>
        <Badge variant={conectado ? "default" : "secondary"}>
          {conectado ? `● Conectado ${numero ? `(${numero})` : ""}` : "○ Desconectado"}
        </Badge>
      </div>

      {!conectado && (
        <div className="text-center">
          <div className="mx-auto h-40 w-40 rounded-xl border-2 border-solid border-border grid place-items-center mb-3 overflow-hidden bg-background">
            {qr ? (
              <img
                src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                alt="QR Code instância de prospecção"
                className="h-full w-full object-contain"
              />
            ) : estado === "connecting" ? (
              <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
            ) : (
              <QrCode className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
          <div className="flex justify-center gap-2">
            <Button size="sm" onClick={handleConnect} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <QrCode className="h-4 w-4 mr-2" />
              )}
              {qr ? "Gerar novo QR" : "Gerar QR Code"}
            </Button>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
            </Button>
          </div>
        </div>
      )}

      {conectado && (
        <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={loading}>
          <LogOut className="h-4 w-4 mr-2" /> Desconectar
        </Button>
      )}
    </Card>
  );
}
