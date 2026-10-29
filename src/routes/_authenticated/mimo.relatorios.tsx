import { createFileRoute } from "@tanstack/react-router";
import { MimoRelatoriosPage } from "@/components/mimo-relatorios-page";

export const Route = createFileRoute("/_authenticated/mimo/relatorios")({
  head: () => ({ meta: [
    { title: "Relatórios MiMo — ZapScout" },
    { name: "description", content: "Relatórios semanais e exportação CSV da MiMo no ZapScout." },
    { property: "og:title", content: "Relatórios MiMo — ZapScout" },
    { property: "og:description", content: "Relatórios semanais e exportação CSV da MiMo no ZapScout." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MimoRelatoriosPage,
});