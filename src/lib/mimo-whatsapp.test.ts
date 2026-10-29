import { describe,it,expect } from 'vitest';
import { mensagemMimo,hashTokenMimo } from './mimo-whatsapp';
const base={key:{id:'msg-1',remoteJid:'5511987654321@s.whatsapp.net',fromMe:false}};
describe('WhatsApp MiMo: mensagens válidas',()=>{
 it('recebe telefone e id sem interpretar conteúdo como empresa',()=>expect(mensagemMimo(base,'sou MiMo')?.telefone).toBe('5511987654321'));
 it('normaliza formatos do telefone',()=>expect(mensagemMimo({...base,key:{...base.key,remoteJid:'(11) 98765-4321'}},'oi')?.telefone).toBe('5511987654321'));
 it('ignora grupo',()=>expect(mensagemMimo({...base,key:{...base.key,remoteJid:'5511987654321@g.us'}},'oi')).toBeNull());
 it('ignora status',()=>expect(mensagemMimo({...base,key:{...base.key,remoteJid:'status@broadcast'}},'oi')).toBeNull());
 it('ignora identificador sem telefone',()=>expect(mensagemMimo({...base,key:{...base.key,remoteJid:'123@lid'}},'oi')).toBeNull());
 it('usa telefone real quando existe LID',()=>expect(mensagemMimo({...base,key:{...base.key,remoteJid:'123@lid'},sender_pn:'5511987654321'},'oi')?.telefone).toBe('5511987654321'));
 it('ignora telefone inválido',()=>expect(mensagemMimo({...base,key:{...base.key,remoteJid:'123'}},'oi')).toBeNull());
 it('não registra evento sem ID estável',()=>expect(mensagemMimo({chatid:'5511987654321'},'oi')).toBeNull());
 it.each([true,'true',1])('identifica envio próprio %s',v=>expect(mensagemMimo({...base,key:{...base.key,fromMe:v}},'oi')?.fromMe).toBe(true));
 it('preserva data original do primeiro contato',()=>expect(mensagemMimo({...base,timestamp:1790856000},'oi')?.contatoEm).toBe('2026-10-01T12:00:00.000Z'));
 it('hash é estável e não contém credencial',async()=>{const h=await hashTokenMimo('credencial-teste');expect(h).toHaveLength(64);expect(h).toBe(await hashTokenMimo('credencial-teste'));expect(h).not.toContain('credencial');});
});