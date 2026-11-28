import { afterEach, expect, it, vi } from "vitest";
const rpc=vi.hoisted(()=>vi.fn());
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:{rpc}}));
import { receberRevenda } from "./mimo-revenda.server";
const d={envio_id:"10000000-0000-4000-8000-000000000010",interesse:"revenda",canal:"loja",cidade:"Cidade sintética",uf:"SP",investimento:"sim",prazo:"trinta_dias",nome:"Pessoa sintética",whatsapp:"11999991234",consentimento:true};
const req=(data:unknown,origin="https://example.invalid")=>new Request("https://example.invalid/api/public/mimo-revenda",{method:"POST",headers:{origin,"content-type":"application/json","cf-connecting-ip":"192.0.2.1"},body:JSON.stringify(data)});
afterEach(()=>vi.resetAllMocks());
it("libera link somente depois da confirmação persistida e usa campos canônicos",async()=>{
 rpc.mockResolvedValue({data:{estado:"recebido",numero:"555391280424"},error:null});
 const r=await receberRevenda(req({...d,empresa_id:"outra",numero:"5511000000000",minimo:1}));
 expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("no-store");
 const b=await r.json();expect(new URL(b.whatsapp).pathname).toBe("/555391280424");
 expect(rpc.mock.calls[0][0]).toBe("mimo_inscrever_revenda_v2");
 expect(rpc.mock.calls[0][1].p_dados).not.toHaveProperty("empresa_id");expect(rpc.mock.calls[0][1].p_ip_hash).toMatch(/^[a-f0-9]{64}$/);
});
it.each([{interesse:"representante"},{investimento:"nao"},{site:"spam"},{consentimento:false}])("não grava nem libera WhatsApp quando os filtros falham: %o",async change=>{
 const r=await receberRevenda(req({...d,...change}));expect(r.status).toBe(400);expect(rpc).not.toHaveBeenCalled();expect(await r.json()).not.toHaveProperty("whatsapp");
});
it("recusa origem externa e corpo excessivo mesmo sem Content-Length",async()=>{
 expect((await receberRevenda(req(d,"https://externo.invalid"))).status).toBe(403);
 expect((await receberRevenda(req({...d,nome:"a".repeat(9000)}))).status).toBe(413);expect(rpc).not.toHaveBeenCalled();
});
it.each([{data:null,error:{message:"sql privado"}},{data:{estado:"limite"},error:null},{data:{estado:"conflito"},error:null},{data:{estado:"recebido",numero:"evil"},error:null}])("não mostra sucesso ou destino quando a gravação não foi confirmada: %o",async resposta=>{
 rpc.mockResolvedValue(resposta);const r=await receberRevenda(req(d));expect(r.ok).toBe(false);const b=await r.json();expect(b).not.toHaveProperty("whatsapp");expect(JSON.stringify(b)).not.toContain("sql privado");
});

