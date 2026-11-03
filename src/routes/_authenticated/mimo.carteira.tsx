import { contextoMimoOptions } from '@/lib/mimo-contexto';
import { createFileRoute } from "@tanstack/react-router";
import { MimoCarteiraPage } from "@/components/mimo-carteira-page";
import { MimoCarregando } from "@/components/mimo-carregando";
export const Route = createFileRoute("/_authenticated/mimo/carteira")({
  loader: async({context})=>{if(context.mimoAcesso.autorizado)await context.queryClient.ensureQueryData(contextoMimoOptions);},
  component: MimoCarteiraPage,
  pendingComponent: MimoCarregando,
  pendingMs: 150,
});
