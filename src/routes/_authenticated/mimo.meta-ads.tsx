import { MimoCarregando } from "@/components/mimo-carregando";
import { createFileRoute } from "@tanstack/react-router";
import { MimoMetaAdsPage, importacoesMetaOptions } from "@/components/mimo-meta-ads-page";

export const Route = createFileRoute("/_authenticated/mimo/meta-ads")({
  pendingComponent: MimoCarregando,
  pendingMs: 150,
  pendingMinMs: 200,
  loader: async ({ context }) => {
    if (!context.mimoAcesso.autorizado) return;
    await context.queryClient.ensureQueryData(importacoesMetaOptions);
  },
  head: () => ({ meta: [
    { title: "Importar Meta Ads — MiMo" },
    { name: "description", content: "Importação privada de relatórios do Meta Ads da MiMo." },
    { property: "og:title", content: "Importar Meta Ads — MiMo" },
    { property: "og:description", content: "Importação privada de relatórios do Meta Ads da MiMo." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: MimoMetaAdsPage,
});
