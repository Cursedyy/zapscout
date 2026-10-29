import { createFileRoute } from "@tanstack/react-router";
import { MimoLeadsPage, contextoMimoOptions, leadsMimoOptions, filtrosIniciais } from '@/components/mimo-leads-page';

export const Route = createFileRoute("/_authenticated/mimo/leads")({
  loader: async ({context}) => {
    if (!context.mimoAcesso.autorizado) return;
    const acesso=await context.queryClient.ensureQueryData(contextoMimoOptions);
    await context.queryClient.ensureQueryData(leadsMimoOptions(acesso.usuarioId,filtrosIniciais));
  },
  head: () => ({ meta: [
    { title: "Leads MiMo — ZapScout" },
    { name: "description", content: "Leads privados da MiMo no ZapScout." },
    { property: "og:title", content: "Leads MiMo — ZapScout" },
    { property: "og:description", content: "Leads privados da MiMo no ZapScout." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MimoLeadsPage,
});