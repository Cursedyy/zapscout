import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {conversaoPedidosMimo} from '@/lib/mimo-comercial-conversao.functions';
import type {FiltroDashboard} from '@/lib/mimo-dashboard';
import {Button} from './ui/button';
export function MimoConversaoPedidos({filtro}:{filtro:FiltroDashboard}){
 const fn=useServerFn(conversaoPedidosMimo);const q=useQuery({queryKey:['mimo-conversao-pedidos',filtro],queryFn:()=>fn({data:filtro}),retry:false});
 const d=q.data?.disponivel?q.data:null;
 const brl=(n:number)=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 return <section className="mt-6 space-y-3 border-y py-5"><h2 className="text-lg font-medium">Pedidos canônicos · equipe comercial</h2><p className="text-sm text-muted-foreground">Coorte de leads que entraram de {filtro.inicio} a {filtro.fim}; primeira confirmação no mesmo período, America/Sao_Paulo. Estado atual; separado do legado e da planilha.</p>
 {q.isPending?<p role="status">Apurando pedidos…</p>:q.isError?<p role="alert">Pedidos não apurados. <Button variant="link" onClick={()=>void q.refetch()}>Tentar novamente</Button></p>:!d?<p role="status">{q.data&&!q.data.disponivel?q.data.motivo:'Apuração indisponível.'}</p>:<dl className="grid gap-4 sm:grid-cols-3"><div><dt>Clientes convertidos / leads</dt><dd>{d.clientes} / {d.leads} · {d.taxa===null?'—':`${d.taxa.toFixed(1)}%`}</dd></div><div><dt>Pedidos confirmados</dt><dd>{d.pedidos} · {brl(d.valorConfirmado)}</dd></div><div><dt>Valor em estados faturados</dt><dd>{brl(d.valorFaturado)}</dd></div></dl>}</section>;
}