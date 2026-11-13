import {it,expect} from 'vitest';
import {conversaoCanonica,identidadeAuxiliar,confirmarAuxiliarSchema,avisoConfigSchema} from './mimo-comercial-v2';
const l={id:'lead',entrada_em:'2026-11-13T12:00:00Z',origem:'whatsapp',campanha_origem:''};
it('conversão usa confirmação canônica sem rascunho/cancelado/conversa/legado',()=>{
 const pedidos=['rascunho','cancelado','aguardando_pagamento','confirmado','faturado'].map(status=>({lead_id:'lead',status,total:1000,primeira_confirmacao:'2026-11-15T12:00:00Z'}));
 expect(conversaoCanonica([l],pedidos,'2026-11-13T00:00:00Z','2026-11-19T23:59:59Z')).toEqual({leads:1,clientes:1,pedidos:2,valorConfirmado:2000,valorFaturado:1000,taxa:100});
});
it('coorte, outro lead, confirmação ausente ou fora do período não contam',()=>{
 const p={lead_id:'lead',status:'confirmado',total:1000,primeira_confirmacao:null};
 expect(conversaoCanonica([l],[p,{...p,lead_id:'outro',primeira_confirmacao:'2026-11-15T12:00:00Z'},{...p,primeira_confirmacao:'2026-11-20T12:00:00Z'}],'2026-11-13T00:00:00Z','2026-11-19T23:59:59Z').pedidos).toBe(0);
});
it('auxiliar exige identidade exclusiva mesmo owner e id',()=>{
 expect(identidadeAuxiliar([],[{id:'i',user_id:'a'}],'a','i')).toBe(true);
 expect(identidadeAuxiliar([{id:'a'}],[{id:'i',user_id:'a'}],'a','i')).toBe(false);
 expect(identidadeAuxiliar([],[{id:'i',user_id:'b'}],'a','i')).toBe(false);
 expect(identidadeAuxiliar([],[{id:'i',user_id:'a'},{id:'j',user_id:'a'}],'a','i')).toBe(false);
});
it('confirmação e destinatário não são implícitos',()=>{expect(confirmarAuxiliarSchema.safeParse({id:null,finalidade:'fechamento',numero:'5511999999999',desafio:'a',confirmado:false}).success).toBe(false);expect(avisoConfigSchema.safeParse({membro:crypto.randomUUID(),vinculo:crypto.randomUUID(),numero:'5511999999999',versao:0,confirmado:true}).success).toBe(true);});