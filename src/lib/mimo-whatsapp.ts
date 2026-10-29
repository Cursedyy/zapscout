import { z } from 'zod';
import { normalizarTelefoneMimo } from './mimo-leads';
const mensagemSchema=z.object({key:z.object({id:z.string().max(200).optional(),remoteJid:z.string().max(100).optional(),fromMe:z.union([z.boolean(),z.string(),z.number()]).optional(),senderPn:z.string().max(100).optional()}).passthrough().optional(),id:z.string().max(200).optional(),messageid:z.string().max(200).optional(),fromMe:z.union([z.boolean(),z.string(),z.number()]).optional(),remoteJid:z.string().max(100).optional(),from:z.string().max(100).optional(),chat:z.string().max(100).optional(),chatid:z.string().max(100).optional(),sender_pn:z.string().max(100).optional(),cleanedSenderPn:z.string().max(100).optional(),isGroup:z.boolean().optional(),pushName:z.string().max(200).optional(),senderName:z.string().max(200).optional(),messageTimestamp:z.union([z.number(),z.string()]).optional(),timestamp:z.union([z.number(),z.string()]).optional()}).passthrough();
export function mensagemMimo(item:unknown,texto:string,agora=new Date()) {
 const p=mensagemSchema.safeParse(item);if(!p.success)return null;const m=p.data;
 const jid=m.key?.remoteJid??m.remoteJid??m.from??m.chat??m.chatid??m.sender_pn;
 if(!jid||m.isGroup||jid.endsWith('@g.us')||jid.includes('broadcast'))return null;
 const real=jid.endsWith('@lid')?(m.sender_pn??m.cleanedSenderPn??m.key?.senderPn):jid;
 if(!real||real.endsWith('@lid')||real.includes('@')&&!real.endsWith('@s.whatsapp.net')&&!real.endsWith('@c.us'))return null;
 let telefone:string|null;try{telefone=normalizarTelefoneMimo(real.split('@')[0]);}catch{return null;}if(!telefone)return null;
 const id=m.key?.id??m.id??m.messageid;if(!id)return null;
 const direcao=m.key?.fromMe??m.fromMe;
 const raw=m.messageTimestamp??m.timestamp;let data=agora;
 if(raw!==undefined){const n=Number(raw);const parsed=Number.isFinite(n)?new Date(n<1e12?n*1000:n):new Date(raw);if(!Number.isNaN(parsed.getTime()))data=parsed;}
 if(data.getTime()>agora.getTime()+300000||data.getTime()<946684800000)return null;
 return {messageId:id,telefone,nome:m.pushName??m.senderName??'',texto:texto.slice(0,10000),contatoEm:data.toISOString(),fromMe:direcao===true||direcao==='true'||direcao===1};
}
export async function hashTokenMimo(token:string) {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}