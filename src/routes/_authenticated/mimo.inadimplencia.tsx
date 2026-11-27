import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoInadimplenciaPage } from "@/components/mimo-inadimplencia-page";

export const Route = createFileRoute("/_authenticated/mimo/inadimplencia")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Inadimplência — MiMo" }] }),
  component: MimoInadimplenciaPage,
});
