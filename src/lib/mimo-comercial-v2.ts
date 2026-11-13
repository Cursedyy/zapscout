import { z } from 'zod';
export const finalidadeSchema=z.enum(['entrada','fechamento']);
export const auxiliarSchema=z.object({id:z.string().uuid().nullable(),finalidade:finalidadeSchema}).strict();
export const confirmarAuxiliarSchema=auxiliarSchema.extend({numero:z.string().regex(/^\d{12,15}$/),desafio:z.string().min(1).max(160),confirmado:z.literal(true)}).strict();
export const slotSchema=z.object({slot:z.enum(['comercial_1','comercial_2','comercial_3'])}).strict();
export const avisoConfigSchema=z.object({membro:z.string().uuid(),vinculo:z.string().uuid(),numero:z.string().regex(/^\d{12,15}$/),confirmado:z.literal(true),versao:z.number().int().min(0)}).strict();
export type AuxiliarInput=z.infer<typeof auxiliarSchema>;
export type ConfirmarAuxiliar=z.infer<typeof confirmarAuxiliarSchema>;
export const COMERCIAL_PENDENTE='Configuração pendente: segunda fatia comercial ainda não ativada no banco. Nenhum vínculo ou aviso foi salvo.';
export function identidadeAuxiliar(profiles:{id:string}[],instancias:{id:string;user_id:string}[],owner:string,id:string){
  return profiles.length===0 && instancias.length===1 && instancias[0].id===id && instancias[0].user_id===owner;
}
export type ConversaoLead={id:string;entrada_em:string;origem:string;campanha_origem:string};
export type ConversaoPedido={lead_id:string;status:string;total:number;primeira_confirmacao:string|null};
/** Current canonical states, immutable first confirmation; never sum the legacy CRM. */
export function conversaoCanonica(leads:ConversaoLead[],pedidos:ConversaoPedido[],de:string,ate:string){
 const coorte=new Set(leads.map(l=>l.id));
 const vendas=pedidos.filter(p=>coorte.has(p.lead_id)&&['confirmado','faturado','enviado','entregue'].includes(p.status)&&p.primeira_confirmacao!==null&&Date.parse(p.primeira_confirmacao)>=Date.parse(de)&&Date.parse(p.primeira_confirmacao)<=Date.parse(ate));
 const clientes=new Set(vendas.map(p=>p.lead_id)).size;
 const faturados=vendas.filter(p=>['faturado','enviado','entregue'].includes(p.status));
 return {leads:coorte.size,clientes,pedidos:vendas.length,valorConfirmado:vendas.reduce((s,p)=>s+p.total,0),valorFaturado:faturados.reduce((s,p)=>s+p.total,0),taxa:coorte.size?clientes/coorte.size*100:null};
}