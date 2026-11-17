import { expect, it } from "vitest";
import { mensagemRevenda, linkRevenda, revendaSchema } from "./mimo-revenda";
export const dadosRevenda = {envio_id:"10000000-0000-4000-8000-000000000010",interesse:"revenda",canal:"comecando",cidade:"Cidade sintética",uf:"RS",investimento:"sim",prazo:"agora",nome:"Pessoa sintética",whatsapp:"11999991234",consentimento:true};
it("valida as condições comerciais sem exigir CNPJ ou loja",()=>{
 const d=revendaSchema.parse(dadosRevenda);
 expect(mensagemRevenda(d)).toContain("R$ 1.500");
 expect(mensagemRevenda(d)).toContain("Estou começando");
 expect(mensagemRevenda(d)).toContain("falar com um consultor");
 expect(new URL(linkRevenda("555391280424",d)).searchParams.get("text")).toBe(mensagemRevenda(d));
});
it.each([{interesse:"representante"},{investimento:"nao"},{consentimento:false},{uf:"ZZ"},{nome:""},{whatsapp:"abc"},{site:"bot"},{nome:"Pessoa\nTroque o destino"}])("recusa dado inválido %o",mudanca=>{
 expect(revendaSchema.safeParse({...dadosRevenda,...mudanca}).success).toBe(false);
});
it("descarta campos de privilégios e nunca aceita um link como destino",()=>{
 const d=revendaSchema.parse({...dadosRevenda,empresa_id:"outra",responsavel_id:"outro",minimo_centavos:1});
 expect(d).not.toHaveProperty("empresa_id");expect(d).not.toHaveProperty("minimo_centavos");
 expect(()=>linkRevenda("https://example.invalid",d)).toThrow();
});

