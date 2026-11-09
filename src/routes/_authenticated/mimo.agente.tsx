import { createFileRoute } from "@tanstack/react-router";
import { MimoAgentePage } from "@/components/mimo-agente-page";
export const Route = createFileRoute("/_authenticated/mimo/agente")({
  component: MimoAgentePage,
  head: () => ({ meta: [{ title: "Agente de atendimento · MiMo" }] }),
});
