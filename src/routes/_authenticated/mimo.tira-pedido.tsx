import { z } from 'zod';
import { MimoCarregando } from "@/components/mimo-carregando";
import { createFileRoute } from '@tanstack/react-router';
import { MimoTiraPage, tiraOptions } from '@/components/mimo-tira-page';
export const Route=createFileRoute('/_authenticated/mimo/tira-pedido')({
  validateSearch: search=>z.object({lead:z.string().uuid().optional(),busca:z.string().max(200).optional()}).parse(search),
  pendingComponent: MimoCarregando,
  pendingMs: 150,
  pendingMinMs: 200,
  loader:async({context})=>{if(context.mimoAcesso.autorizado)await context.queryClient.ensureQueryData(tiraOptions);},
  head:()=>({meta:[{title:'Tira-pedido MiMo — ZapScout'},{name:'description',content:'Pedidos, catálogo, bonificações e propostas comerciais privadas da MiMo.'},{property:'og:title',content:'Tira-pedido MiMo — ZapScout'},{property:'og:description',content:'Pedidos e propostas comerciais privadas da MiMo.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex, nofollow'}]}),
  component:TiraRoute,
});
function TiraRoute(){const search=Route.useSearch();return <MimoTiraPage search={search}/>;}
