import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { MimoVazio } from "@/components/mimo-vazio";

export const Route = createFileRoute("/mimo/relatorios")({
  head: () => ({ meta: [
    { title: "Relatórios MiMo — ZapScout" },
    { name: "description", content: "Relatórios privados da MiMo no ZapScout." },
    { property: "og:title", content: "Relatórios MiMo — ZapScout" },
    { property: "og:description", content: "Relatórios privados da MiMo no ZapScout." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <MimoVazio titulo="Relatórios" subtitulo="Resultados da MiMo." icon={BarChart3} texto="Os relatórios da MiMo serão adicionados em uma próxima etapa." />,
});