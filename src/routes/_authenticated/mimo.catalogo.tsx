import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoCatalogoAgentePage } from "@/components/mimo-catalogo-agente-page";

export const Route = createFileRoute("/_authenticated/mimo/catalogo")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Catálogo do agente — MiMo" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: MimoCatalogoAgentePage,
});
