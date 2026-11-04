import { MimoCarregando } from "@/components/mimo-carregando";
import { createFileRoute } from "@tanstack/react-router";
import { MimoCampanhasPage } from "@/components/mimo-campanhas-page";

export const Route = createFileRoute("/_authenticated/mimo/campanhas")({
  pendingComponent: MimoCarregando,
  pendingMs: 150,
  pendingMinMs: 200,
  head: () => ({
    meta: [
      { title: "Campanhas MiMo — ZapScout" },
      { name: "description", content: "Campanhas privadas da MiMo no ZapScout." },
      { property: "og:title", content: "Campanhas MiMo — ZapScout" },
      { property: "og:description", content: "Campanhas privadas da MiMo no ZapScout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MimoCampanhasPage,
});
