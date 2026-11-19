import { MimoCarregando } from "@/components/mimo-carregando";
import { createFileRoute } from "@tanstack/react-router";
import { MimoDashboardPage } from "@/components/mimo-dashboard-page";
import { MimoPainelPedidos } from "@/components/mimo-painel-pedidos";

export const Route = createFileRoute("/_authenticated/mimo/")({
  pendingComponent: MimoCarregando,
  pendingMs: 150,
  pendingMinMs: 200,
  head: () => ({ meta: [
    { title: "Dashboard MiMo — ZapScout" },
    { name: "description", content: "Indicadores comerciais privados da MiMo." },
    { property: "og:title", content: "Dashboard MiMo — ZapScout" },
    { property: "og:description", content: "Indicadores comerciais privados da MiMo." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: MimoIndex,
});

function MimoIndex() {
  const { mimoAcesso } = Route.useRouteContext();
  if (!mimoAcesso.autorizado) return null;
  return mimoAcesso.papel === "administrativo" ? <MimoPainelPedidos /> : <MimoDashboardPage />;
}
