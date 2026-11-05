import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoCarrinhosPage } from "@/components/mimo-carrinhos-page";
export const Route = createFileRoute("/_authenticated/mimo/automacoes")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Recuperação de carrinhos MiMo — ZapScout" }] }),
  component: MimoCarrinhosPage,
});
