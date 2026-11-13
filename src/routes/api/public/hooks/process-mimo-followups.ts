import {createFileRoute} from '@tanstack/react-router';
import {gateCronHook} from '@/lib/hook-gate.server';
export const Route=createFileRoute('/api/public/hooks/process-mimo-followups')({server:{handlers:{POST:async({request})=>{
 const gate=await gateCronHook(request,'process-mimo-followups');if(gate)return gate;
 try {const {executarAvisosFollowupMimo}=await import('@/lib/mimo-follow-aviso-worker.server');return Response.json({resultado:await executarAvisosFollowupMimo()},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({erro:'aviso_processamento_indisponivel'},{status:503,headers:{'Cache-Control':'no-store'}});}
}}}});
