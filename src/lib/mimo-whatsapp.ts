import { z } from 'zod';
import { normalizarTelefoneMimo } from './mimo-leads';
import { mensagemColetivaWhatsApp } from './whatsapp-grupos';
export function numeroConectadoMimo(valor?: string | null) { try { return normalizarTelefoneMimo((valor ?? '').split('@')[0].split(':')[0]); } catch { return null; } }
/** UAZAPI echoes may prefix IDs with the sender. Strip only the confirmed sender's prefix. */
export function idEnvioMimo(id: string, numeroComercial: string) {
 const origem=numeroConectadoMimo(numeroComercial),prefixo=origem ? origem+':' : '';
 if(!prefixo||!id.startsWith(prefixo))return id;
 const sufixo=id.slice(prefixo.length);
 return /^[A-Za-z0-9_-]{1,160}$/.test(sufixo)?sufixo:id;
}
export const marcadorImagemWhatsApp = '[imagem]';
export const CATALOGO_CHAT_MIMO = 'Catálogo MiMo (PDF)';
/** Store the media kind and its caption. Files and provider URLs stay out of the conversation. */
export function conteudoRecebidoMimo(item: unknown, texto: string) {
 const m=item&&typeof item==='object'?item as Record<string,unknown>:{};
 const interno=m.message&&typeof m.message==='object'?m.message as Record<string,unknown>:m;
 const tipo = String(m.messageType ?? m.type ?? interno.messageType ?? interno.type ?? '').toLowerCase();
 const midia = String(m.mediaType ?? interno.mediaType ?? m.mimetype ?? interno.mimetype ?? '').toLowerCase();
 if(interno.documentMessage||/document/.test(`${tipo} ${midia}`)) {
  const documento = (interno.documentMessage ?? interno.content ?? m.content) as { caption?: unknown; Caption?: unknown } | undefined;
  if (m.wasSentByApi === true && (m.fromMe === true || (m.key as { fromMe?: unknown } | undefined)?.fromMe === true) &&
    [texto, m.text, documento?.caption, documento?.Caption].includes(CATALOGO_CHAT_MIMO)) return CATALOGO_CHAT_MIMO;
  return '[anexo indisponivel]';
 }
 if(interno.stickerMessage||/sticker/.test(tipo))return '[anexo indisponivel]';
 if(interno.audioMessage||/audio|ptt/.test(`${tipo} ${midia}`))return '[audio]';
 if(interno.videoMessage||/video|document|sticker/.test(`${tipo} ${midia}`))return '[anexo indisponivel]';
 if(interno.imageMessage||[tipo, midia].some((valor) => /^(image(?:message)?|image\/.+)$/.test(valor))) {
  const imagem = (interno.imageMessage ?? interno.content ?? m.content) as { caption?: unknown; Caption?: unknown } | undefined;
  const legenda = [imagem?.caption, imagem?.Caption, interno.text, m.text]
   .find((valor): valor is string => typeof valor === 'string' && valor.trim().length > 0);
  return legenda ? `${marcadorImagemWhatsApp} ${legenda.trim()}` : marcadorImagemWhatsApp;
 }
 if (/image/.test(`${tipo} ${midia}`)) return '[anexo indisponivel]';
 return texto;
}
const textoRefMimo=(v:unknown)=>typeof v==='string'&&v.trim()?v.replace(/\s+/g,' ').trim().slice(0,300):undefined;
/** UAZAPI delivers the raw WhatsApp message in `content` (object or JSON string). */
function conteudoBrutoMimo(m:Record<string,unknown>):Record<string,unknown>|null{
 const c=m.content;
 if(c&&typeof c==='object')return c as Record<string,unknown>;
 if(typeof c==='string'&&c.length<=20000&&c.trimStart().startsWith('{')){try{const o=JSON.parse(c);return o&&typeof o==='object'?o:null;}catch{return null;}}
 return null;
}
/** Authenticated provider metadata is preserved as evidence, never inferred attribution. */
export function referenciaAnuncioMimo(item: unknown) {
 if(!item||typeof item!=='object')return null;
 const m=item as Record<string,unknown>;
 const body=m.message&&typeof m.message==='object'?m.message as Record<string,unknown>:m;
 const ext=body.extendedTextMessage as {contextInfo?:{externalAdReply?:unknown}}|undefined;
 const contexto=body.contextInfo as {externalAdReply?:unknown}|undefined;
 const bruto=conteudoBrutoMimo(m);
 const brutoCtx=(bruto?.contextInfo??(bruto?.extendedTextMessage as {contextInfo?:unknown}|undefined)?.contextInfo) as {externalAdReply?:unknown}|undefined;
 for(const ref of [m.referral,contexto?.externalAdReply,ext?.contextInfo?.externalAdReply,brutoCtx?.externalAdReply]) {
  if(!ref||typeof ref!=='object')continue;
  const r=ref as Record<string,unknown>,id=r.source_id??r.sourceId??r.sourceID,url=r.source_url??r.sourceUrl??r.sourceURL;
  if(typeof id!=='string'||!id||id.length>200||typeof url!=='string')continue;
  try {
   const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||!["facebook.com","instagram.com","fb.me"].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))continue;
   const titulo=textoRefMimo(r.headline??r.title),descricao=textoRefMimo(r.body),tipo=textoRefMimo(r.source_type??r.sourceType);
   return {id,url:u.href.slice(0,1000),fonte:'metadado_whatsapp' as const,...(titulo?{titulo}:{}),...(descricao?{descricao}:{}),...(tipo?{tipo:tipo.slice(0,40)}:{})};
  } catch{continue;}
 }
 return null;
}
const mensagemSchema=z.object({key:z.object({id:z.string().max(200).optional(),remoteJid:z.string().max(100).optional(),fromMe:z.union([z.boolean(),z.string(),z.number()]).optional(),senderPn:z.string().max(100).optional()}).passthrough().optional(),id:z.string().max(200).optional(),messageid:z.string().max(200).optional(),fromMe:z.union([z.boolean(),z.string(),z.number()]).optional(),remoteJid:z.string().max(100).optional(),from:z.string().max(100).optional(),chat:z.string().max(100).optional(),chatid:z.string().max(100).optional(),sender_pn:z.string().max(100).optional(),cleanedSenderPn:z.string().max(100).optional(),isGroup:z.boolean().optional(),pushName:z.string().max(200).optional(),senderName:z.string().max(200).optional(),messageTimestamp:z.union([z.number(),z.string()]).optional(),timestamp:z.union([z.number(),z.string()]).optional()}).passthrough();
export function mensagemMimo(item:unknown,texto:string,agora=new Date()) {
 if(mensagemColetivaWhatsApp(item))return null;
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
