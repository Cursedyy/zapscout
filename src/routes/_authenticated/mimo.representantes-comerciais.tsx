import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoRepresentantesComerciaisPage } from "@/components/mimo-representantes-comerciais-page";
export const Route = createFileRoute("/_authenticated/mimo/representantes-comerciais")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Representantes comerciais MiMo" }] }),
  component: MimoRepresentantesComerciaisPage,
});
