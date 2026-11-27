import { expect, it, vi } from "vitest";
import { configInicialAgente, respostaContingenciaAgente, revisaoRespostaAgente, type MensagemAgente } from "./mimo-agente";
import { gerarRespostaAgente } from "./mimo-agente-modelo.server";
vi.mock("./claude.server", () => ({ chamarClaude: () => { throw Error("modelo indisponível"); } }));
const u = (content: string): MensagemAgente => ({ role: "user", content });
const a = (content: string): MensagemAgente => ({ role: "assistant", content });
const inicio = [u("Quero mais informações"), a("Você quer saber mais sobre revenda ou representação?")];

it("explica como começar, entende o nome e segue com o estado mesmo sem modelo", async () => {
  const mensagens = [...inicio, u("Como faço pra encomendar e vender")];
  const orientacao = await gerarRespostaAgente(configInicialAgente, mensagens, {});
  expect(orientacao.resposta).toMatch(/compra os produtos.*vender aos seus clientes/i);
  expect(orientacao.dados.revenda?.evidencia).toBe("Como faço pra encomendar e vender");
  mensagens.push(a(orientacao.resposta), u("Ana"));
  const seguinte = await gerarRespostaAgente(configInicialAgente, mensagens, orientacao.dados);
  expect(seguinte.dados.nome?.valor).toBe("Ana");
  expect(seguinte.resposta).toMatch(/qual estado/i);
});

it("recupera o objetivo e o nome da conversa antiga e responde à dúvida e ao pedido de áudio", async () => {
  const mensagens = [...inicio, u("Sim e pra vender pra outras pessoas"), a("Como você se chama?"),
    u("Ana"), a("Você busca informações sobre algum produto específico da MiMo?"), u("Como assim")];
  const explicacao = await gerarRespostaAgente(configInicialAgente, mensagens, {});
  expect(explicacao.resposta).toMatch(/estado/i);
  expect(explicacao.dados.nome?.valor).toBe("Ana");
  expect(explicacao.dados.revenda).toBeDefined();
  mensagens.push(a(explicacao.resposta), u("Manda um áudio"), u("Por favor"));
  const resposta = await gerarRespostaAgente(configInicialAgente, mensagens, explicacao.dados);
  expect(resposta).toMatchObject({ estado: "agente", encaminhar: false });
  expect(resposta.resposta).toMatch(/por escrito.*estado/i);
  expect(revisaoRespostaAgente(mensagens, resposta)).toBeNull();
  expect(respostaContingenciaAgente(configInicialAgente, mensagens, explicacao.dados).resposta).toBe(resposta.resposta);
  mensagens.push(a(resposta.resposta), u("Pernambuco"));
  const proxima = await gerarRespostaAgente(configInicialAgente, mensagens, resposta.dados);
  expect(proxima.dados.cidade_uf).toBeDefined();
  expect(proxima.resposta).toMatch(/ramo/i);
});

it("respeita pedidos de parada mesmo com revenda e áudio declarados", async () => {
  const r = await gerarRespostaAgente(configInicialAgente, [...inicio, u("É pra vender pra outras pessoas. Pare de mandar mensagens.")], {});
  expect(r.estado).toBe("bloqueada");
});
