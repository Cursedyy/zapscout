import {createFileRoute} from '@tanstack/react-router';
import {gateCronHook} from '@/lib/hook-gate.server';
export const Route=createFileRoute('/api/public/hooks/process-mimo-quentes')({server:{handlers:{POST:async({request})=>{
 const gate=await gateCronHook(request,'process-mimo-quentes');if(gate)return gate;
 try {
  const {agendarFollowupMimo, agendarFollowupsPainelMimo}=await import('@/lib/mimo-agente-followup.server');
  const {executarObservacaoMimo}=await import('@/lib/mimo-agente-quentes-worker.server');
  const {sincronizarReacoesMimo}=await import('@/lib/mimo-agente-reacoes.server');
  await agendarFollowupMimo();
  const followups = await agendarFollowupsPainelMimo().catch(() => 'indisponivel');
  const [resultado, reacoes] = await Promise.all([
   executarObservacaoMimo(),
   sincronizarReacoesMimo().catch(() => 'indisponivel'),
  ]);
  return Response.json({resultado, followups, reacoes, release:'mimo-followups-painel-1'},{headers:{'Cache-Control':'no-store'}});
 }
 catch{return Response.json({erro:'observacao_processamento_indisponivel'},{status:503,headers:{'Cache-Control':'no-store'}});}
}}}});
