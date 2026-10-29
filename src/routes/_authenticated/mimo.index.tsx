import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import { MimoVazio } from "@/components/mimo-vazio";

export const Route = createFileRoute("/_authenticated/mimo/")({
  head: () => ({ meta: [
    { title: "Dashboard MiMo — ZapScout" },
    { name: "description", content: "Área privada da MiMo no ZapScout." },
    { property: "og:title", content: "Dashboard MiMo — ZapScout" },
    { property: "og:description", content: "Área privada da MiMo no ZapScout." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <MimoVazio titulo="Dashboard" subtitulo="Visão geral da MiMo." icon={LayoutDashboard} texto="Os indicadores da MiMo aparecerão aqui nas próximas etapas." />,
});