import { createFileRoute } from "@tanstack/react-router";
import { MimoEquipePage } from "@/components/mimo-equipe-page";

export const Route = createFileRoute("/_authenticated/mimo/equipe")({
  head: () => ({ meta: [
    { title: "Equipe — MiMo" },
    { name: "description", content: "Gestão privada de membros e auditoria da MiMo." },
    { property: "og:title", content: "Equipe — MiMo" },
    { property: "og:description", content: "Gestão privada de membros e auditoria da MiMo." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: MimoEquipePage,
});
