import {beforeEach,expect,it,vi} from "vitest";
const f=vi.hoisted(()=>({exigir:vi.fn(),rpc:vi.fn(),config:vi.fn(),iniciar:vi.fn(),request:vi.fn(),cookie:vi.fn(),acesso:vi.fn(),worker:vi.fn(),testar:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>{const b={middleware:()=>b,validator:()=>b,handler:(h:unknown)=>h};return b;}}));
vi.mock("@/integrations/supabase/auth-middleware",()=>({requireSupabaseAuth:{}}));
vi.mock("./mimo-leads.server",()=>({exigirMimo:f.exigir}));
vi.mock("./mimo-email-db.server",()=>({rpcEmail:f.rpc,ErroEmailRpc:class extends Error{codigo="PGRST202";}}));
vi.mock("./mimo-gmail.server",()=>({configGmail:f.config,iniciarGmail:f.iniciar,acessoGmail:f.acesso,COOKIE_GMAIL:"__Host-mimo_gmail_oauth"}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:f.request,setCookie:f.cookie}));
vi.mock("./mimo-email-worker.server",()=>({executarEmailMimo:f.worker,testarEmailMimo:f.testar}));
import {obterPainelEmailMimo,conectarGmailMimo,configurarEmailMimo,enviarTesteEmailMimo,enviarEmailManualMimo} from "./mimo-email.functions";
const executar=(fn:unknown,data?:unknown)=>(fn as (v:unknown)=>Promise<unknown>)({context:{supabase:{},userId:"ator-verificado"},data});
beforeEach(()=>{
 vi.resetAllMocks();f.exigir.mockResolvedValue({empresaId:"empresa",papel:"gestor"});
 f.config.mockReturnValue({empresa:"empresa",origem:"https://app.example.invalid"});
 f.request.mockReturnValue(new Request("https://app.example.invalid/mimo/automacoes",{headers:{origin:"https://app.example.invalid"}}));
 f.iniciar.mockResolvedValue({state:"sintetico",url:"https://accounts.google.com/sintetico"});f.rpc.mockResolvedValue({});
});
it.each(["vendedor","marketing","administrativo"])("nega %s antes de ler credenciais ou enviar",async(papel)=>{
 f.exigir.mockResolvedValue({empresaId:"empresa",papel});
 for(const fn of [obterPainelEmailMimo,conectarGmailMimo,configurarEmailMimo,enviarTesteEmailMimo,enviarEmailManualMimo])await expect(executar(fn,{ativo:true,checkout:"42",email:"teste@example.invalid",id:"sintetico"})).rejects.toThrow("Acesso exclusivo");
 expect(f.rpc).not.toHaveBeenCalled();expect(f.worker).not.toHaveBeenCalled();expect(f.testar).not.toHaveBeenCalled();
});
it("inicia somente na origem autorizada e guarda cookie HttpOnly",async()=>{
 expect(await executar(conectarGmailMimo)).toEqual({url:"https://accounts.google.com/sintetico"});
 expect(f.iniciar).toHaveBeenCalledWith("empresa","ator-verificado");
 expect(f.cookie).toHaveBeenCalledWith("__Host-mimo_gmail_oauth","sintetico",expect.objectContaining({httpOnly:true,secure:true,sameSite:"lax",path:"/"}));
});
it("origem diferente não cria estado OAuth",async()=>{
 f.request.mockReturnValue(new Request("https://app.example.invalid/mimo/automacoes",{headers:{origin:"https://evil.example.invalid"}}));
 await expect(executar(conectarGmailMimo)).rejects.toThrow("endereço autorizado");expect(f.iniciar).not.toHaveBeenCalled();
});
it("pausa sem depender do Gmail, com ator autenticado",async()=>{
 expect(await executar(configurarEmailMimo,{ativo:false,ator:"forjado"})).toEqual({ativo:false});
 expect(f.rpc).toHaveBeenCalledWith("mimo_email_configurar",{_empresa:"empresa",_ator:"ator-verificado",_ativo:false});expect(f.acesso).not.toHaveBeenCalled();
});
it("ativa somente depois de verificar o Gmail ao vivo",async()=>{
 f.acesso.mockRejectedValue(Error("Conta desconectada"));await expect(executar(configurarEmailMimo,{ativo:true})).rejects.toThrow();expect(f.rpc).not.toHaveBeenCalled();
});
it("manual usa empresa e ator verificados",async()=>{
 f.worker.mockResolvedValue("enviada");expect(await executar(enviarEmailManualMimo,{checkout:"42",empresa:"outra",ator:"forjado"})).toEqual({resultado:"enviada"});
 expect(f.worker).toHaveBeenCalledExactlyOnceWith({empresa:"empresa",ator:"ator-verificado",checkout:"42"});
});
it("erro interno não vaza para a resposta de envio",async()=>{
 f.worker.mockRejectedValue(Error("token-privado"));await expect(executar(enviarEmailManualMimo,{checkout:"42"})).rejects.toThrow("Atualize o carrinho");expect(f.worker).toHaveBeenCalledTimes(1);
});
