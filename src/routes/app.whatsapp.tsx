import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MessageCircle, QrCode } from "lucide-react";

export const Route = createFileRoute("/app/whatsapp")({ component: WhatsAppPage });

function WhatsAppPage() {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <PageHeader title="WhatsApp" subtitle="Conecte uma instância para iniciar envios." />
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="grid place-items-center h-16 w-16 rounded-2xl bg-primary/15 text-primary mx-auto mb-4">
          <MessageCircle className="h-8 w-8" />
        </div>
        <h2 className="font-semibold text-lg mb-1">Nenhuma conexão ativa</h2>
        <p className="text-sm text-muted-foreground mb-6">Conecte via Evolution API ou Baileys lendo o QR Code.</p>
        <div className="mx-auto h-48 w-48 rounded-xl border-2 border-dashed border-border grid place-items-center mb-6">
          <QrCode className="h-16 w-16 text-muted-foreground" />
        </div>
        <Button>Gerar QR Code</Button>
        <p className="text-xs text-muted-foreground mt-4">Integração com Evolution API estará disponível em breve.</p>
      </div>
    </div>
  );
}
