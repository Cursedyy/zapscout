import { createFileRoute } from "@tanstack/react-router";
import { MimoPerdasPage } from "@/components/mimo-perdas-page";

export const Route = createFileRoute("/_authenticated/mimo/perdas")({
  head: () => ({ meta: [
    { title: "Motivos de perda — MiMo" },
    { name: "description", content: "Relatório privado dos motivos de perda de leads da MiMo." },
    { property: "og:title", content: "Motivos de perda — MiMo" },
    { property: "og:description", content: "Relatório privado dos motivos de perda de leads da MiMo." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: MimoPerdasPage,
});
