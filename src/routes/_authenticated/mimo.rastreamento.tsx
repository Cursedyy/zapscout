import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoRastreamentoPage } from "@/components/mimo-rastreamento-page";

export const Route = createFileRoute("/_authenticated/mimo/rastreamento")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Rastreamento de entregas — MiMo" }] }),
  component: MimoRastreamentoPage,
});
