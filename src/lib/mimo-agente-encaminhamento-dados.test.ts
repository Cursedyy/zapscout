import { expect, it } from "vitest";
import { configInicialAgente, finalizarResultadoAgente, type MensagemAgente } from "./mimo-agente";

const rascunho = { resposta: "Posso ajudar.", dados: {}, encaminhar: false, motivo: "" };
const pedido: MensagemAgente = { role: "user", content: "Quero falar com um atendente." };
const dados = {
  nome: { valor: "Ana", evidencia: "Sou Ana" },
  cidade_uf: { valor: "SP", evidencia: "sou de SP" },
  estabelecimento: { valor: "mercado", evidencia: "tenho um mercado" },
};

it("mantém a conversa com o agente até obter os três dados", () => {
  const primeiro = finalizarResultadoAgente(configInicialAgente, [pedido], {}, rascunho);
  expect(primeiro).toMatchObject({ estado: "agente", encaminhar: false });
  expect(primeiro.resposta).toMatch(/nome.*estado.*ramo/);

  const mensagens: MensagemAgente[] = [
    pedido,
    { role: "assistant", content: primeiro.resposta },
    { role: "user", content: "Sou Ana, sou de SP e tenho um mercado." },
  ];
  const completo = finalizarResultadoAgente(configInicialAgente, mensagens, {}, { ...rascunho, dados });
  expect(completo).toMatchObject({ estado: "humano", encaminhar: true, dados });
});

it("aproveita nome e ramo e pede um estado quando só há cidade", () => {
  const resultado = finalizarResultadoAgente(configInicialAgente, [pedido], {
    ...dados,
    cidade_uf: { valor: "Campinas", evidencia: "Moro em Campinas" },
  }, rascunho);
  expect(resultado).toMatchObject({ estado: "agente", encaminhar: false });
  expect(resultado.resposta).toContain("seu estado");
  expect(resultado.resposta).not.toMatch(/nome|ramo/);
});

it("respeita a recusa e mantém a interrupção de mensagens disponível", () => {
  const recusa = finalizarResultadoAgente(configInicialAgente, [
    { role: "user", content: "Prefiro não informar." },
  ], {}, rascunho);
  expect(recusa).toMatchObject({ estado: "agente", encaminhar: false });
  expect(recusa.resposta).not.toContain("?");
  const parar = finalizarResultadoAgente(configInicialAgente, [
    { role: "user", content: "Pare de me enviar mensagens." },
  ], {}, rascunho);
  expect(parar.estado).toBe("bloqueada");
});
