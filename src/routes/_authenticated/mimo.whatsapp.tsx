import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoWhatsAppPage } from "@/components/mimo-whatsapp-page";
export const Route = createFileRoute("/_authenticated/mimo/whatsapp")({
  component: MimoWhatsAppPage,
  pendingComponent: MimoCarregando,
  pendingMs: 150,
  head: () => ({ meta: [{ title: "WhatsApp MiMo — ZapScout" },{name:'description',content:'Configuração privada dos números comerciais e avisos internos MiMo.'},{property:'og:title',content:'WhatsApp MiMo — ZapScout'},{property:'og:description',content:'Números comerciais e avisos internos privados MiMo.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex, nofollow'}] }),
});
