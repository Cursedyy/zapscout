import { createFileRoute } from "@tanstack/react-router";
import { MimoCampanhaDesenhosPage } from "@/components/mimo-campanha-desenhos-page";

export const Route = createFileRoute("/_authenticated/mimo/campanha-desenhos")({
  head: () => ({ meta: [{ title: "Campanha de desenhos | MiMo" }] }),
  component: MimoCampanhaDesenhosPage,
});
