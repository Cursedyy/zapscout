import { describe,it,expect,vi,beforeEach } from 'vitest';
const state=vi.hoisted(()=>({handler:null as null|((v:{request:Request})=>Promise<Response>),mimo:vi.fn(),buffer:vi.fn(),criar:vi.fn(),dedup:new Set<string>(),find:vi.fn()}));
vi.mock('@tanstack/react-router',()=>({createFileRoute:()=> (options:{server:{handlers:{POST:typeof state.handler}}})=>{state.handler=options.server.handlers.POST;return {};}}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{from:(t:string)=>{const q={select:()=>q,eq:()=>q,or:()=>q,limit:()=>q,order:()=>q,update:()=>q,maybeSingle:async()=>({data:null,error:null}),insert:async(v:{event_id?:string})=>{if(t==='ia_webhook_eventos'&&v.event_id){if(state.dedup.has(v.event_id))return {error:{code:'23505'}};state.dedup.add(v.event_id);}return {error:null};},then:(f:(v:unknown)=>unknown)=>Promise.resolve({data:[{id:'personal',sequence_state:null,status:'novo',nome_empresa:'Contato',telefone:'5511987654321',whatsapp:'5511987654321',history:[]}],error:null}).then(f)};return q;}}}));
vi.mock('@/lib/mimo-whatsapp.server',()=>({receberWhatsappMimo:state.mimo}));
vi.mock('@/lib/ia.server',()=>({bufferizarMensagemIA:state.buffer}));
vi.mock('@/lib/uazapi-resolve.server',()=>({resolveInstanciaPorToken:vi.fn(async()=>({userId:'owner',instanciaId:null}))}));
vi.mock('@/lib/ia-inbound-lead.server',()=>({criarLeadRecebidoIA:state.criar}));
vi.mock('@/lib/ia-numeros-ignorados.server',()=>({contatoIgnoradoIA:vi.fn(async()=>false)}));
vi.mock('@/lib/webhook-dispatch.server',()=>({dispararWebhooksServer:vi.fn()}));
import '@/routes/api/public/uazapi-webhook';
async function chamar(secret='teste-webhook',mensagem:Record<string,unknown>={},extra:Record<string,unknown>={}){
 if(!state.handler)throw new Error('Handler ausente');return state.handler({request:new Request(`http://localhost:8080/api/public/uazapi-webhook?secret=${secret}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'messages',token:'token-teste',message:{id:'m1',chatid:'5511987654321',fromMe:false,text:'oi',...mensagem},...extra})})});
}
beforeEach(()=>{vi.clearAllMocks();state.dedup.clear();vi.stubEnv('UAZAPI_WEBHOOK_SECRET','teste-webhook');state.mimo.mockResolvedValue(false);});
describe('Webhook MiMo regressões',()=>{
 it.each([
   {isGroup:true}, {isGroup:'true'}, {key:{remoteJid:'5511987654321@s.whatsapp.net'},chatid:'120363000000000001@g.us'},
 ])('grupo não chega ao CRM comercial nem à IA pessoal: %j',async mensagem=>{
   expect((await chamar('teste-webhook',mensagem)).status).toBe(200);
   expect(state.mimo).not.toHaveBeenCalled();expect(state.buffer).not.toHaveBeenCalled();expect(state.criar).not.toHaveBeenCalled();
 });
 it('metadados de grupo no envelope impedem processar telefone do participante',async()=>{
   await chamar('teste-webhook',{}, {chat:{wa_isGroup:true}});
   expect(state.mimo).not.toHaveBeenCalled();expect(state.buffer).not.toHaveBeenCalled();expect(state.criar).not.toHaveBeenCalled();
 });
 it('conversa comercial nunca segue para IA pessoal',async()=>{state.mimo.mockResolvedValue(true);await chamar();expect(state.buffer).not.toHaveBeenCalled();expect(state.criar).not.toHaveBeenCalled();});
 it('autenticação inválida não processa MiMo nem IA',async()=>{expect((await chamar('incorreto')).status).toBe(401);expect(state.mimo).not.toHaveBeenCalled();expect(state.buffer).not.toHaveBeenCalled();});
 it('sem vínculo preserva IA e CRM pessoal',async()=>{expect((await chamar()).status).toBe(200);expect(state.buffer).toHaveBeenCalledWith('owner','personal','oi',null);});
 it('MiMo recebe dono resolvido sem depender de conteúdo',async()=>{await chamar();expect(state.mimo).toHaveBeenCalledWith(expect.anything(),'owner','token-teste',expect.objectContaining({id:'m1'}),'oi');});
 it('evento repetido não repete IA mas permite recuperar MiMo',async()=>{await chamar();await chamar();expect(state.buffer).toHaveBeenCalledTimes(1);expect(state.mimo).toHaveBeenCalledTimes(2);});
 it('falha MiMo bloqueia IA pessoal e retry continua isolado',async()=>{state.mimo.mockRejectedValueOnce(new Error('falha')).mockResolvedValue(true);expect((await chamar()).status).toBe(503);expect(state.buffer).not.toHaveBeenCalled();expect((await chamar()).status).toBe(200);expect(state.buffer).not.toHaveBeenCalled();});
});
