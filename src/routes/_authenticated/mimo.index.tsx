import { createFileRoute } from "@tanstack/react-router";
import { MimoDashboardPage } from "@/components/mimo-dashboard-page";

export const Route = createFileRoute("/_authenticated/mimo/")({
  head: () => ({ meta: [
    { title: "Dashboard MiMo — ZapScout" },
    { name: "description", content: "Indicadores comerciais privados da MiMo." },
    { property: "og:title", content: "Dashboard MiMo — ZapScout" },
    { property: "og:description", content: "Indicadores comerciais privados da MiMo." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: MimoDashboardPage,
});
