import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoRepresentantesPage } from "@/components/mimo-representantes-page";
export const Route = createFileRoute("/_authenticated/mimo/representantes")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Representantes MiMo" }] }),
  component: MimoRepresentantesPage,
});
