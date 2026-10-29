import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { MimoVazio } from "@/components/mimo-vazio";

export const Route = createFileRoute("/_authenticated/mimo/campanhas")({
  head: () => ({ meta: [
    { title: "Campanhas MiMo — ZapScout" },
    { name: "description", content: "Campanhas privadas da MiMo no ZapScout." },
    { property: "og:title", content: "Campanhas MiMo — ZapScout" },
    { property: "og:description", content: "Campanhas privadas da MiMo no ZapScout." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <MimoVazio titulo="Campanhas" subtitulo="Ações comerciais da MiMo." icon={Send} texto="As campanhas da MiMo aparecerão aqui quando essa etapa for liberada." />,
});