import { createFileRoute } from "@tanstack/react-router";
import { KanbanSquare } from "lucide-react";
import { MimoVazio } from "@/components/mimo-vazio";

export const Route = createFileRoute("/mimo/leads")({
  head: () => ({ meta: [
    { title: "Leads MiMo — ZapScout" },
    { name: "description", content: "Leads privados da MiMo no ZapScout." },
    { property: "og:title", content: "Leads MiMo — ZapScout" },
    { property: "og:description", content: "Leads privados da MiMo no ZapScout." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <MimoVazio titulo="Leads" subtitulo="Contatos da equipe MiMo." icon={KanbanSquare} texto="O CRM da MiMo será criado em uma próxima etapa." />,
});