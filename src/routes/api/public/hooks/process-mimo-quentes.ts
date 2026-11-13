import {createFileRoute} from '@tanstack/react-router';
import {gateCronHook} from '@/lib/hook-gate.server';
export const Route=createFileRoute('/api/public/hooks/process-mimo-quentes')({server:{handlers:{POST:async({request})=>{
 const gate=await gateCronHook(request,'process-mimo-quentes');if(gate)return gate;
 try{const {executarObservacaoMimo}=await import('@/lib/mimo-agente-quentes-worker.server');return Response.json({resultado:await executarObservacaoMimo(),release:'mimo-observacao-estilo-1'},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({erro:'observacao_processamento_indisponivel'},{status:503,headers:{'Cache-Control':'no-store'}});}
}}}});
