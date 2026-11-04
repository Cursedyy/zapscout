import { createFileRoute } from "@tanstack/react-router";
import { MimoPricingPage } from "@/components/mimo-pricing-page";
import { MimoCarregando } from "@/components/mimo-carregando";
export const Route = createFileRoute("/_authenticated/mimo/arvore-comercial")({
  component: MimoPricingPage,
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Árvore Comercial MiMo" }] }),
});
