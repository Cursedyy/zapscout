import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { contextoComercialMimo } from '@/lib/mimo-comercial.functions';
import { exibirComercial } from '@/lib/mimo-comercial';
import { ORIGENS } from '@/lib/mimo-leads';
import { dinheiro, STATUS } from '@/lib/mimo-pedido';
import { Button } from './ui/button';
export function ContextoComercialLead({leadId,usuarioId}:{leadId:string;usuarioId:string}) {
  const ler=useServerFn(contextoComercialMimo);
  const q=useQuery({queryKey:['mimo-comercial-contexto',usuarioId,leadId],queryFn:()=>ler({data:{id:leadId}}),retry:false});
  if(q.isPending) return <p role="status">Carregando contexto comercial…</p>;
  if(q.isError) return <p role="alert">Contexto comercial indisponível. <Button variant="link" onClick={()=>void q.refetch()}>Tentar novamente</Button></p>;
  const c=q.data;
  return <section className="space-y-5 py-4 text-sm">
    <Button asChild><Link to="/mimo/tira-pedido" search={{lead:leadId}}>Novo pedido para este lead</Link></Button>
    <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-muted-foreground">Entrada · horário de São Paulo</dt><dd>{exibirComercial(c.lead.entrada_em)}</dd></div><div><dt className="text-muted-foreground">Origem registrada</dt><dd>{ORIGENS[c.lead.origem as keyof typeof ORIGENS]??'Não informada'}</dd></div><div><dt className="text-muted-foreground">Campanha registrada</dt><dd>{c.lead.campanha_origem||'Não informada'}</dd></div><div><dt className="text-muted-foreground">Anúncio registrado</dt><dd>{c.lead.anuncio_origem||'Não informado'}</dd></div></dl>
    <div className="border-t pt-4"><h3 className="font-medium">Evidências de anúncio no WhatsApp</h3>{c.evidencias.length?<ul className="mt-2 space-y-2">{c.evidencias.map((e,i)=><li key={i} className="break-words">{e.titulo||'Referência registrada'} · {e.referencia||'Sem identificador'} · {e.tipo||'Tipo não informado'} · {exibirComercial(e.contato_em)}</li>)}</ul>:<p className="mt-2 text-muted-foreground">Sem evidência de anúncio registrada. A conversa não comprova origem Meta Ads.</p>}</div>
    <div className="border-t pt-4"><h3 className="font-medium">Últimos contatos comerciais confirmados</h3>{!c.contatos.length?<p className="mt-2 text-muted-foreground">Nenhum contato registrado em vínculo comercial confirmado.</p>:<ol className="mt-3 space-y-3">{c.contatos.map(m=><li key={m.direcao}><p className="font-medium">{m.direcao==='recebida'?'Recebido':'Enviado'} · {exibirComercial(m.contato_em)}</p><p className="mt-1 whitespace-pre-wrap break-words">{m.texto||'Mensagem sem texto'}</p></li>)}</ol>}</div>
    <div className="border-t pt-4"><h3 className="font-medium">Pedidos vinculados</h3>{c.pedidos===null?<p role="alert">Consulta de pedidos indisponível; venda e faturamento não apurados.</p>:<>{c.resumo&&<dl className="my-3 grid gap-3 sm:grid-cols-2"><div><dt>Vendas confirmadas · {c.resumo.vendas}</dt><dd>{dinheiro(c.resumo.valorConfirmado)}</dd></div><div><dt>Faturados · {c.resumo.faturados}</dt><dd>{dinheiro(c.resumo.valorFaturado)}</dd></div></dl>}{!c.pedidos.length?<p className="text-muted-foreground">Nenhum pedido vinculado. Conversa e cadastro não são venda.</p>:<ul className="space-y-2">{c.pedidos.map(p=><li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2"><Button variant="link" asChild><Link to="/mimo/tira-pedido" search={{busca:String(p.numero)}}>Pedido #{p.numero}</Link></Button><span>{STATUS[p.status as keyof typeof STATUS]??p.status}</span><span>{dinheiro(p.total)}</span></li>)}</ul>}</>}</div>
    {(c.lead.etapa==='pedido_fechado'||c.lead.valor_pedido!==null||c.lead.conversao_em)&&<div className="border-t pt-4"><h3 className="font-medium">Registro comercial legado · separado dos pedidos</h3><p className="mt-2">Etapa: {c.lead.etapa==='pedido_fechado'?'Pedido fechado no cadastro':c.lead.etapa}. Valor informado: {c.lead.valor_pedido===null?'Não informado':Number(c.lead.valor_pedido).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}.</p><p className="text-muted-foreground">Este registro não confirma venda ou faturamento no Tira-pedido e não é somado aos pedidos.</p></div>}
  </section>;
}
