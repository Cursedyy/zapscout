import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("./mimo-email-db.server",()=>({rpcEmail:f.rpc}));
vi.mock("./mimo-nuvemshop-oauth.server",()=>({configOAuthNuvem:()=>({empresa:"10000000-0000-4000-8000-000000000001",loja:"123"})}));
import {callbackGmail,configGmail,cifrarGmail,hashGmail,COOKIE_GMAIL,ESCOPO_GMAIL} from "./mimo-gmail.server";
const empresa="10000000-0000-4000-8000-000000000001",ator="20000000-0000-4000-8000-000000000001";
const env={MIMO_GMAIL_EMPRESA_ID:empresa,MIMO_GMAIL_ORIGIN:"https://app.example.invalid",MIMO_GMAIL_SENDER:"remetente@example.invalid",MIMO_GMAIL_CLIENT_ID:"sintetico.apps.googleusercontent.com",MIMO_GMAIL_CLIENT_SECRET:"segredo-sintetico",MIMO_GMAIL_TOKEN_KEY:"a".repeat(64),MIMO_GMAIL_UNSUBSCRIBE_KEY:"b".repeat(64)};
const cfg=configGmail(env)!;
const identidade={sub:"google-sintetico",email:cfg.remetente,email_verified:true};
const tokens={access_token:"access-sintetico",refresh_token:"refresh-sintetico",token_type:"Bearer",scope:`openid email ${ESCOPO_GMAIL}`};
beforeEach(()=>{vi.resetAllMocks();for(const [k,v] of Object.entries(env))vi.stubEnv(k,v);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
async function tentativaValida() {
 const state="c".repeat(64),hash=await hashGmail(state);
 const verificador=await cifrarGmail("verificador-sintetico",cfg,`pkce:${hash}`);
 f.rpc.mockImplementation(async(nome:string)=>nome==="mimo_email_oauth_consumir"?{empresa,ator,verificador}:{});
 return new Request(cfg.origem+`/api/public/mimo-gmail-oauth?state=${state}&code=codigo-sintetico`,{headers:{cookie:`${COOKIE_GMAIL}=${state}`}});
}
it("persiste invalid_client em cookie e URL sem expor o corpo Google",async()=>{
 const request=await tentativaValida();
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({error:"invalid_client",error_description:"segredo-que-nao-pode-vazar"},{status:401})));
 const r=await callbackGmail(request);
 expect(r.headers.get("location")).toContain("gmail_motivo=invalid_client");
 expect(r.headers.get("set-cookie")).toContain("__Host-mimo_gmail_resultado=invalid_client");
 expect(r.headers.get("set-cookie")).toContain("HttpOnly");
 expect(JSON.stringify([...r.headers])).not.toContain("segredo-que-nao-pode-vazar");
 expect(f.rpc).toHaveBeenLastCalledWith("mimo_email_oauth_falhar",expect.objectContaining({_empresa:empresa,_ator:ator}));
 expect(f.rpc.mock.calls.some(([n])=>n==="mimo_email_oauth_salvar")).toBe(false);
});
it("erro Google fora da lista segura não é copiado para o retorno",async()=>{
 const request=await tentativaValida();vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({error:"codigo-secreto-injetado"},{status:400})));
 const r=await callbackGmail(request);
 expect(r.headers.get("location")).toContain("gmail_motivo=google_http");
 expect(JSON.stringify([...r.headers])).not.toContain("codigo-secreto-injetado");
});
it("salva cifra com ator consumido e só depois sinaliza sucesso",async()=>{
 const request=await tentativaValida();
 vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json(tokens)).mockResolvedValueOnce(Response.json(identidade)));
 const r=await callbackGmail(request);
 expect(r.headers.get("location")).toContain("gmail=sucesso");
 expect(f.rpc).toHaveBeenLastCalledWith("mimo_email_oauth_salvar",expect.objectContaining({_empresa:empresa,_ator:ator,_remetente:cfg.remetente,_cifrado:expect.stringMatching(/^v1:/)}));
 expect(JSON.stringify(f.rpc.mock.calls)).not.toContain(tokens.refresh_token);
 expect(f.rpc.mock.calls.some(([n])=>n==="mimo_email_oauth_falhar")).toBe(false);
});
it("falha de persistência após validar a identidade nunca sinaliza sucesso",async()=>{
 const request=await tentativaValida();const normal=f.rpc.getMockImplementation()!;
 f.rpc.mockImplementation(async(...args)=>{if(args[0]==="mimo_email_oauth_salvar")throw Error("detalhe-privado");return normal(...args);});
 vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json(tokens)).mockResolvedValueOnce(Response.json(identidade)));
 const r=await callbackGmail(request);
 expect(r.headers.get("location")).toContain("gmail_motivo=gravar_credencial");
 expect(f.rpc).toHaveBeenLastCalledWith("mimo_email_oauth_falhar",expect.anything());
 expect(JSON.stringify([...r.headers])).not.toContain("detalhe-privado");
});
