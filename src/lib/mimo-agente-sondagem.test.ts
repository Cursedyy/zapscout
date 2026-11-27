import { expect, it } from "vitest";
import { configInicialAgente as config, finalizarResultadoAgente, respostaDeterministicaAgente, memoriaClienteAgente, proximaPerguntaSondagemAgente, respostaContingenciaAgente, revisaoRespostaAgente, type DadosAgente } from "./mimo-agente";
const valores = {nome:"Ana",cidade_uf:"SC",estabelecimento:"loja",revenda:"quero revender"};
const dados = Object.fromEntries(Object.entries(valores).map(([k,v])=>[k,{valor:v,evidencia:v}])) as DadosAgente;
const mensagens = [{role:"user" as const,content:Object.values(valores).join("; ")}];
const r = {resposta:"Obrigada por contar!",dados:{},encaminhar:false};
it("responde diretamente se a pessoa precisa investir para começar a revender", () => {
  const mensagens = [{ role: "user" as const, content: "Ser pra eu ser uma vendedora eu tenho que investir" }];
  expect(respostaDeterministicaAgente(config, mensagens, {})).toMatchObject({
    estado: "agente",
    resposta: "Sim. Para revender a MiMo, você precisa comprar os produtos que vai revender.",
  });
});
it("encaminha a revenda depois de recuperar a ficha com cidade em uma quarta linha", () => {
  const a = (content: string) => ({ role: "assistant" as const, content });
  const u = (content: string) => ({ role: "user" as const, content });
  const conversa = [
    a("Para encaminhar seu atendimento, preciso de seu nome, seu estado e seu ramo de atuação. Pode me informar?"),
    u("Diego Silva\nRs\nCidade passo fundo\nPequeno distribuidor de doces e salgados"),
    a("Sua dúvida é sobre revenda, representação ou compra para consumo próprio?"),
    u("Revenda"),
  ];
  expect(memoriaClienteAgente(conversa, {})).toMatchObject({ nome: { valor: "Diego Silva" },
    cidade_uf: { valor: "Rs" }, estabelecimento: { valor: "Pequeno distribuidor de doces e salgados" } });
  expect(respostaDeterministicaAgente(config, conversa, {})).toMatchObject({
    estado: "humano", encaminhar: true,
    dados: { nome: { valor: "Diego Silva" }, cidade_uf: { valor: "Rs" },
      estabelecimento: { valor: "Pequeno distribuidor de doces e salgados" } },
  });
});
it("recupera nome com erro de digitação, estado e ocupação sem repetir perguntas", () => {
  const a = (content: string) => ({ role: "assistant" as const, content });
  const u = (content: string) => ({ role: "user" as const, content });
  const historico = [u("Quero revender"), a("Me informe seu nome, estado e ramo de atuação, por favor!"),
    u("Rio De Janeiro me chammo André")];
  const memoria = memoriaClienteAgente(historico, {});
  expect(memoria).toMatchObject({ nome: { valor: "André" }, cidade_uf: { valor: "Rio De Janeiro" } });
  expect(proximaPerguntaSondagemAgente(config, memoria)).toBe("Qual é o seu ramo de atuação?");
  const conversa = [...historico, a("Qual é o seu ramo de atuação?"), u("Vendedor")];
  expect(finalizarResultadoAgente(config, conversa, {}, r)).toMatchObject({
    estado: "humano", encaminhar: true, dados: { estabelecimento: { valor: "Vendedor" } },
  });
  expect(memoriaClienteAgente([...conversa, a("Para encaminhar seu atendimento, preciso de seu estado e seu ramo de atuação. Pode me informar?"),
    u("Rio de Janeiro\nRamo de atuação: Vendedor")], {})).toMatchObject({
    nome: { valor: "André" }, cidade_uf: { valor: "Rio de Janeiro" }, estabelecimento: { valor: "Vendedor" },
  });
});
it("estado e ramo não encerram coleta sem nome",()=>{
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
it("triagem básica completa vai ao comercial sem depender de anexo", () => {
 for (const catalogoHistorico of [false, true]) {
   const resultado = finalizarResultadoAgente(config, mensagens, dados, r, new Date(), catalogoHistorico, true);
   expect(resultado).toMatchObject({ estado: "humano", motivo: "pre_qualificacao_pendente_revisao" });
   expect(resultado.materialSolicitado).toBeUndefined();
   expect(resultado.resumo).toContain("estabelecimento: loja");
 }
});
it.each(["Quero falar com uma pessoa","Tenho um pedido atrasado","Prefiro não informar","[audio]"])("pede os dados básicos antes de encaminhar: %s",content=>{
 expect(finalizarResultadoAgente(config,[{role:"user",content}],{},r,new Date(),false,true).estado).toBe("agente");
});
it("não aceita dados inventados sem evidências do cliente",()=>{
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
  expect(resultado.resposta).toBe("Como você quer seguir com a MiMo?");
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
  expect(resultado.resposta).toBe("Qual é o seu ramo de atuação?");
  expect(revisaoRespostaAgente(historico, resultado)).toBeNull();
});

it("mantém revenda e encaminha quando a pessoa responde os três campos no mesmo balão", () => {
  const historico = [
    { role: "user", content: "Revenda" },
    { role: "assistant", content: "Perfeito! Me informa seu nome, seu estado e qual é o seu ramo de atuação, por favor?" },
    { role: "user", content: "Barbara\nCotia SP\nMassoterapeuta e revenda de lingerie" },
  ] as const;
  const resultado = respostaDeterministicaAgente(config, [...historico], {});
  expect(resultado).toMatchObject({
    estado: "humano",
    encaminhar: true,
    motivo: "pre_qualificacao_pendente_revisao",
    dados: {
      nome: { valor: "Barbara" },
      cidade_uf: { valor: "Cotia SP" },
      estabelecimento: { valor: "Massoterapeuta e revenda de lingerie" },
    },
  });
});

it("recupera dados de uma resposta anterior quando o cliente volta ao assunto", () => {
  const historico = [
    { role: "user", content: "Quero revender" },
    { role: "assistant", content: "Qual o seu nome, estado e ramo de atuação?" },
    { role: "user", content: "Ana\nCotia SP\nEmpório" },
    { role: "assistant", content: "Que produto chamou sua atenção?" },
    { role: "user", content: "Qual o valor do tempero?" },
  ] as const;
  const resultado = finalizarResultadoAgente(config, [...historico], {}, r);
  expect(resultado).toMatchObject({
    estado: "humano",
    dados: {
      nome: { valor: "Ana" },
      cidade_uf: { valor: "Cotia SP" },
      estabelecimento: { valor: "Empório" },
    },
  });
});

it("preserva uma correção já salva ao recuperar um dado antigo", () => {
  const historico = [
    { role: "assistant", content: "Qual o seu nome, estado e ramo de atuação?" },
    { role: "user", content: "Ana\nCotia SP\nEmpório" },
    { role: "assistant", content: "Como posso ajudar?" },
    { role: "user", content: "Quero retomar a revenda." },
  ] as const;
  const corrigido = { cidade_uf: { valor: "RS", evidencia: "Na verdade é RS" } };
  expect(memoriaClienteAgente([...historico], corrigido)).toMatchObject({
    nome: { valor: "Ana" },
    cidade_uf: corrigido.cidade_uf,
    estabelecimento: { valor: "Empório" },
  });
});

it.each([
  ["Como você se chama?", "Prefiro não informar"],
  ["Em qual estado você pretende revender?", "Uberaba"],
  ["Em qual estado você pretende revender?", "MG\nSP"],
  ["Qual é o seu ramo de atuação?", "Não sou revendedora"],
])("não fecha a ficha com uma resposta ambígua ou negativa", (pergunta, resposta) => {
  expect(memoriaClienteAgente([
    { role: "assistant", content: pergunta },
    { role: "user", content: resposta },
  ], {})).toEqual({});
});
