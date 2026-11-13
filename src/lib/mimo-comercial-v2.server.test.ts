import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({exigir:vi.fn(),status:vi.fn(),connect:vi.fn(),webhook:vi.fn(),rpc:vi.fn(),from:vi.fn(),init:vi.fn(),update:vi.fn(),duplicates:false}));
vi.mock('./mimo-leads.server',()=>({exigirMimo:f.exigir}));
vi.mock('./whatsapp.functions',()=>({publicWebhookUrl:()=> 'https://example.test/webhook'}));
vi.mock('./uazapi.server',async original=>({...await original<typeof import('./uazapi.server')>(),uazStatus:f.status,uazConnect:f.connect,uazUpdateWebhook:f.webhook,uazInitInstance:f.init}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{from:f.from,rpc:f.rpc}}));
import {capacidadeComercial,estadoAuxiliar,parearAuxiliar,confirmarAuxiliar,contextoDesafioAuxiliar} from './mimo-comercial-v2.server';
import {desafioNumeroMimo} from './mimo-whatsapp-conexao.server';
import {hashTokenMimo} from './mimo-whatsapp';
const c={userId:'ator',supabase:{from:f.from,rpc:f.rpc}} as unknown as Parameters<typeof estadoAuxiliar>[0];
beforeEach(()=>{
 vi.resetAllMocks();f.duplicates=false;vi.stubEnv('UAZAPI_WEBHOOK_SECRET','sintetico');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','chave-sintetica');
 f.exigir.mockResolvedValue({empresaId:'empresa',papel:'administrador'});f.rpc.mockResolvedValue({data:2,error:null});
 f.status.mockResolvedValue({status:'connected',profileNumber:'5511999999999'});f.webhook.mockResolvedValue(undefined);f.connect.mockResolvedValue({status:'connecting',qrcode:'c3ludGhldGlj'});
 f.from.mockImplementation((t:string)=>{const data=t==='profiles'?(f.duplicates?[{id:'ator'}]:[]):[{id:'instancia',user_id:'ator'}];const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:'instancia',user_id:'ator',token:'token-sintetico'}}),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve),update:(v:unknown)=>{f.update(t,v);return q;}};return q;});
});
afterEach(()=>vi.unstubAllEnvs());
it('capacidade ausente fica indisponível sem inferir zero',async()=>{f.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}});expect(await capacidadeComercial(c.supabase,'empresa')).toBe(false);});
it('pareamento auxiliar configura envios autenticados sem escrever/desconectar principal',async()=>{
 f.status.mockResolvedValue({status:'disconnected'});expect((await parearAuxiliar(c,{id:'instancia',finalidade:'fechamento'})).status).toBe('connecting');
 expect(f.webhook).toHaveBeenCalledWith('token-sintetico','https://example.test/webhook',['messages'],{incluirEnviosApi:true});expect(f.update).not.toHaveBeenCalled();
});
it('auxiliar duplicada em perfil é negada antes do provider',async()=>{f.duplicates=true;await expect(estadoAuxiliar(c,{id:'instancia',finalidade:'entrada'})).rejects.toThrow('ambígua');expect(f.status).not.toHaveBeenCalled();});
it('connected sem número não emite desafio',async()=>{f.status.mockResolvedValue({status:'connected'});expect(await estadoAuxiliar(c,{id:'instancia',finalidade:'fechamento'})).toMatchObject({numero:null,desafio:null});});
it.each(['vendedor','gestor','marketing','administrativo'])('%s não pode vincular',async papel=>{f.exigir.mockResolvedValue({empresaId:'empresa',papel});await expect(estadoAuxiliar(c,{id:'instancia',finalidade:'entrada'})).rejects.toThrow('administrador');expect(f.status).not.toHaveBeenCalled();});
it('desafio liga instância, propósito, hash e número; extra segmento é rejeitado',async()=>{
 const hash=await hashTokenMimo('token-sintetico'),numero='5511999999999';
 const desafio=desafioNumeroMimo('empresa','ator',contextoDesafioAuxiliar(hash,'instancia','entrada'),numero);
 await expect(confirmarAuxiliar(c,{id:'instancia',finalidade:'fechamento',numero,desafio,confirmado:true})).rejects.toThrow('mudou');
 await expect(confirmarAuxiliar(c,{id:'instancia',finalidade:'entrada',numero,desafio:desafio+'.extra',confirmado:true})).rejects.toThrow('expirou');expect(f.webhook).not.toHaveBeenCalled();
});
it('reconfirma número ao vivo antes de gravar binding',async()=>{const live=await estadoAuxiliar(c,{id:'instancia',finalidade:'fechamento'});if(!live.numero||!live.desafio)throw Error('fixture');f.status.mockResolvedValue({status:'connected',profileNumber:'5511888888888'});await expect(confirmarAuxiliar(c,{id:'instancia',finalidade:'fechamento',numero:live.numero,desafio:live.desafio,confirmado:true})).rejects.toThrow('mudou');expect(f.webhook).not.toHaveBeenCalled();});