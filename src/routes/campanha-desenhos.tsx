import { createFileRoute } from "@tanstack/react-router";
import { MimoCampanhaDesenhosForm } from "@/components/mimo-campanha-desenhos-form";

export const Route = createFileRoute("/campanha-desenhos")({
  head: () => ({
    meta: [{ title: "Envie seu desenho | MiMo" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: MimoCampanhaDesenhosForm,
});
