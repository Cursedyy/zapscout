import { expect, it } from "vitest";
import { configInicialAgente as config, finalizarResultadoAgente, proximaPerguntaSondagemAgente, respostaContingenciaAgente, revisaoRespostaAgente, type DadosAgente } from "./mimo-agente";
const valores = {nome:"Ana",cidade_uf:"SC",estabelecimento:"loja",revenda:"quero revender",problema:"pouca variedade",implicacao:"perco vendas",necessidade:"ampliar o mix"};
const dados = Object.fromEntries(Object.entries(valores).map(([k,v])=>[k,{valor:v,evidencia:v}])) as DadosAgente;
const mensagens = [{role:"user" as const,content:Object.values(valores).join("; ")}];
const r = {resposta:"Obrigada por contar!",dados:{},encaminhar:false};
it("estado e ramo não encerram coleta sem nome e SPIN",()=>{
 const basicos={cidade_uf:dados.cidade_uf,estabelecimento:dados.estabelecimento,revenda:dados.revenda};
 const resultado=finalizarResultadoAgente({...config,campos:["cidade_uf","estabelecimento","revenda"]},mensagens,basicos,{...r,encaminhar:true,motivo:"lead_pronto"},new Date(),false,true);
 expect(resultado.estado).toBe("agente");expect(resultado.resposta).toBe("Como você se chama?");
});
it("cidade sem estado não completa localização e pede somente o dado faltante",()=>{
 expect(proximaPerguntaSondagemAgente(config,{...dados,cidade_uf:{valor:"Pelotas",evidencia:"Pelotas"}})).toContain("estado");
});
it("rascunho de promessa prematura vira pergunta antes de ser enviado",()=>{
 const resultado=finalizarResultadoAgente(config,mensagens,{nome:dados.nome},{...r,resposta:"Vou encaminhar para a equipe",encaminhar:true},new Date(),false,true);
 expect(resultado.estado).toBe("agente");expect(resultado.resposta).toContain("estado");expect(resultado.resposta).not.toContain("encaminhar");
});
it("sondagem completa vai ao comercial sem depender de anexo", () => {
 for (const catalogoHistorico of [false, true]) {
   const resultado = finalizarResultadoAgente(config, mensagens, dados, r, new Date(), catalogoHistorico, true);
   expect(resultado).toMatchObject({ estado: "humano", motivo: "pre_qualificacao_pendente_revisao" });
   expect(resultado.materialSolicitado).toBeUndefined();
   expect(resultado.resumo).toContain("problema: pouca variedade");
 }
});
it.each(["Quero falar com uma pessoa","Tenho um pedido atrasado","Prefiro não informar","[audio]"])("pede os dados básicos antes de encaminhar: %s",content=>{
 expect(finalizarResultadoAgente(config,[{role:"user",content}],{},r,new Date(),false,true).estado).toBe("agente");
});
it("não aceita sondagem inventada sem evidências do cliente",()=>{
 const resultado=finalizarResultadoAgente(config,[{role:"user",content:"Ana"}],{}, {...r,dados},new Date(),true,true);
 expect(resultado.dados).toEqual({nome:dados.nome});expect(resultado.estado).toBe("agente");
});
it("pergunta comercial inicial mantém a intenção e coleta os dados sem inventar preço",()=>{
 const resultado=finalizarResultadoAgente(config,[{role:"user",content:"Qual o preço?"}],{},r,new Date(),false,true);
 expect(resultado).toMatchObject({estado:"agente",encaminhar:false,motivo:"condicao_comercial"});
 expect(resultado.resposta).not.toMatch(/como voc[eê] se chama|R\$/i);
});

const perguntaGenerica = "Pode me contar um pouco mais sobre o que você quer saber da MiMo?";
it("responde quando a pergunta genérica da contingência já apareceu na conversa", () => {
  const historico = [
    { role: "assistant" as const, content: perguntaGenerica },
    { role: "user" as const, content: "Gostaria de conhecer a marca." },
  ];
  const resultado = respostaContingenciaAgente(config, historico, {});
  expect(resultado).toMatchObject({ estado: "agente", encaminhar: false, motivo: "" });
  expect(resultado.resposta).toContain("revenda, representação ou compra");
  expect(revisaoRespostaAgente(historico, resultado)).toBeNull();
});

it("avança na revenda sem pedir de novo o nome ou o estado já informado", () => {
  const historico = [
    { role: "user" as const, content: "Quero revender em Santa Catarina." },
    { role: "assistant" as const, content: "Como você se chama?" },
    { role: "assistant" as const, content: perguntaGenerica },
    { role: "user" as const, content: "Queria montar um pequeno negócio." },
  ];
  const resultado = respostaContingenciaAgente(config, historico, {});
  expect(resultado).toMatchObject({ estado: "agente", encaminhar: false });
  expect(resultado.resposta).toBe("Como você vende hoje ou pretende começar a revender?");
  expect(revisaoRespostaAgente(historico, resultado)).toBeNull();
});
