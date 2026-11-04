import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoWhatsAppPage } from "@/components/mimo-whatsapp-page";
export const Route = createFileRoute("/_authenticated/mimo/whatsapp")({
  component: MimoWhatsAppPage,
  pendingComponent: MimoCarregando,
  pendingMs: 150,
  head: () => ({ meta: [{ title: "WhatsApp MiMo — ZapScout" }] }),
});
