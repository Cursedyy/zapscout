import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoOmiePage } from "@/components/mimo-omie-page";

export const Route = createFileRoute("/_authenticated/mimo/omie")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "OMIE · Prévia de CFOP — MiMo" }] }),
  component: MimoOmiePage,
});
