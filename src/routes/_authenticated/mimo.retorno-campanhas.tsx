import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoRetornoCampanhasPage } from "@/components/mimo-retorno-campanhas-page";

export const Route = createFileRoute("/_authenticated/mimo/retorno-campanhas")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Investimento e retorno — MiMo" }] }),
  component: MimoRetornoCampanhasPage,
});
