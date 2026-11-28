import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  configInicialAgente,
  respostaContingenciaAgente,
  respostaSeguraAgente,
  revisaoRespostaAgente,
  type DadosAgente,
  type MensagemAgente,
  type ResultadoAgente,
} from "./mimo-agente";
import { dadosFichaRevendaAgente } from "./mimo-agente-revenda";
import {
  PERGUNTA_ASSUNTO_AGENTE,
  PERGUNTA_NOME_AGENTE,
  PERGUNTA_RAMO_AGENTE,
} from "./mimo-agente-opcoes";

const gateway = vi.hoisted(() => vi.fn());
vi.mock("./gemini.server", () => ({ chamarGemini: gateway }));
import { gerarRespostaAgente } from "./mimo-agente-modelo.server";

const c = configInicialAgente;
const AVISO_HORARIO = c.disponibilidade;
// Saturday 06:25 BRT, outside the team hours, like the v8 pilot test.
const SABADO_MADRUGADA = new Date("2026-11-28T09:25:00Z");
const pilotoAbertura: MensagemAgente[] = [
  { role: "user", content: "oi" },
  { role: "user", content: "teste piloto" },
];
const aberturaAnuncio: MensagemAgente[] = [
  { role: "user", content: "Olá! Posso ter mais informações sobre isso?" },
];
// Synthetic stale resale form matched by phone only (same shape as the "asd" card).
const fichaAntiga = dadosFichaRevendaAgente(
  {
    id: "00000000-0000-4000-8000-0000000000f1",
    preenchidoEm: "2026-11-20T12:00:00Z",
    respostas: {
      nome: "Fulana",
      cidade: "Cidade Teste",
      uf: "RJ",
      canal: "loja",
      interesse: "revenda",
    } as never,
  },
  {},
);
const timeout = () =>
  Object.assign(Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

/** Mirrors the worker: model, then the contingency on a transport error, then the safety net. */
async function turnoWorker(mensagens: MensagemAgente[], dados: DadosAgente) {
  let r: ResultadoAgente;
  try {
    r = await gerarRespostaAgente(c, mensagens, dados);
  } catch {
    r = respostaContingenciaAgente(c, mensagens, dados);
  }
  return respostaSeguraAgente(c, mensagens, dados, r);
}
const semEncaminhar = (r: ResultadoAgente) => {
  expect(r).toMatchObject({ estado: "agente", encaminhar: false });
  expect(r.resposta).not.toMatch(/encaminhar/i);
  expect(r.resposta).not.toContain(AVISO_HORARIO);
};

beforeEach(() => {
  gateway.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SABADO_MADRUGADA);
});
afterEach(() => vi.useRealTimers());

it("causa das 06:26: o ramo 'Loja física' da ficha antiga reprovava a própria pergunta de ramo", () => {
  expect(fichaAntiga.estabelecimento?.valor).toBe("Loja física");
  const contingencia = respostaContingenciaAgente(c, pilotoAbertura, fichaAntiga);
  // The sequence still needs the branch ("Loja física" is too vague) and asks for it...
  expect(contingencia).toMatchObject({
    estado: "agente",
    resposta: expect.stringContaining(PERGUNTA_RAMO_AGENTE),
  });
  // ...and the review no longer rejects that question as "already informed" (it did before the fix,
  // which sent the worker to the resposta_requer_revisao handoff with the hours notice).
  expect(revisaoRespostaAgente(pilotoAbertura, contingencia)).toBeNull();
});

it.each([
  ["oi + teste piloto", pilotoAbertura],
  ["abertura de anúncio", aberturaAnuncio],
])("%s pede o nome, sem encaminhar, mesmo com timeout do modelo", async (_n, mensagens) => {
  gateway.mockRejectedValue(timeout());
  const r = await turnoWorker(mensagens, {});
  semEncaminhar(r);
  expect(r.resposta).toContain(PERGUNTA_NOME_AGENTE);
});

it("oi + teste piloto com resposta válida do modelo pede o nome", async () => {
  gateway.mockResolvedValue(
    JSON.stringify({ resposta: "Olá! Como você se chama?", dados: {}, encaminhar: false }),
  );
  const r = await turnoWorker(pilotoAbertura, {});
  semEncaminhar(r);
  expect(r.resposta).toContain(PERGUNTA_NOME_AGENTE);
});

it("ficha antiga + timeout no 1º contato: segue a sequência, sem encaminhar", async () => {
  gateway.mockRejectedValue(timeout());
  const r = await turnoWorker(pilotoAbertura, fichaAntiga);
  semEncaminhar(r);
  expect(r.resposta).toContain(PERGUNTA_RAMO_AGENTE);
});

const meioSequencia: MensagemAgente[] = [
  { role: "user", content: "Quero revender" },
  { role: "assistant", content: PERGUNTA_NOME_AGENTE },
  { role: "user", content: "Ana" },
  { role: "assistant", content: "Em qual estado você pretende revender?" },
  { role: "user", content: "BA" },
];
const repetido = JSON.stringify({
  resposta: "Em qual estado você pretende revender?",
  dados: {},
  encaminhar: false,
});
const encaminhaSemDados = JSON.stringify({
  resposta: "Vou encaminhar à equipe.",
  dados: {},
  encaminhar: true,
  motivo: "resposta_requer_revisao",
});

it.each([
  ["erro do modelo", () => gateway.mockRejectedValue(Error("gateway 500"))],
  ["timeout do modelo", () => gateway.mockRejectedValue(timeout())],
  ["JSON inválido", () => gateway.mockResolvedValue("não é json")],
  ["resposta reprovada (repetição)", () => gateway.mockResolvedValue(repetido)],
  ["modelo tenta encaminhar sem dados", () => gateway.mockResolvedValue(encaminhaSemDados)],
])("meio da sequência, %s: faz a próxima pergunta (ramo)", async (_n, preparar) => {
  preparar();
  const r = await turnoWorker(meioSequencia, {});
  semEncaminhar(r);
  expect(r.resposta).toContain(PERGUNTA_RAMO_AGENTE);
});

it("rede de segurança: rascunho e contingência reprovados viram a próxima pergunta, nunca encaminhamento", () => {
  // The previous question was the branch one; repeating it is still better than closing the conversation.
  const historico: MensagemAgente[] = [
    ...meioSequencia,
    { role: "assistant", content: PERGUNTA_RAMO_AGENTE },
    { role: "user", content: "?" },
  ];
  const reprovado: ResultadoAgente = {
    resposta: PERGUNTA_RAMO_AGENTE,
    dados: {},
    estado: "agente",
    encaminhar: false,
    motivo: "",
    resumo: "",
  };
  expect(revisaoRespostaAgente(historico, reprovado)).toBe("repeticao");
  const r = respostaSeguraAgente(c, historico, {}, reprovado);
  semEncaminhar(r);
  expect(r.motivo).not.toBe("resposta_requer_revisao");
});

it("abertura sem nome e sem assunto: rede de segurança pergunta o nome, depois o assunto", () => {
  const nula = respostaSeguraAgente(c, pilotoAbertura, {}, null);
  semEncaminhar(nula);
  expect(nula.resposta).toBe(PERGUNTA_NOME_AGENTE);
  const comNome = respostaSeguraAgente(
    c,
    [
      ...pilotoAbertura,
      { role: "assistant", content: PERGUNTA_NOME_AGENTE },
      { role: "user", content: "Ana" },
    ],
    {},
    null,
  );
  semEncaminhar(comNome);
  expect(comNome.resposta).toContain(PERGUNTA_ASSUNTO_AGENTE);
});

it("revenda completa fora do horário encaminha no fim, com o aviso de horário só nessa mensagem", async () => {
  gateway.mockRejectedValue(timeout());
  const conversa: MensagemAgente[] = [{ role: "user", content: "Quero revender" }];
  const respostas: ResultadoAgente[] = [];
  for (const fala of ["Ana", "BA", "Vendo doces"]) {
    const r = await turnoWorker(conversa, {});
    respostas.push(r);
    conversa.push({ role: "assistant", content: r.resposta }, { role: "user", content: fala });
  }
  const final = await turnoWorker(conversa, {});
  respostas.push(final);
  expect(respostas.slice(0, -1).map((r) => r.estado)).toEqual(["agente", "agente", "agente"]);
  for (const r of respostas.slice(0, -1)) semEncaminhar(r);
  expect(final).toMatchObject({
    estado: "humano",
    encaminhar: true,
    motivo: "pre_qualificacao_pendente_revisao",
  });
  expect(final.resposta).toContain("encaminhar");
  expect(final.resposta).toContain(AVISO_HORARIO);
  expect(respostas.filter((r) => r.resposta.includes(AVISO_HORARIO))).toHaveLength(1);
});

it("toda resposta que anuncia encaminhamento sai como estado humano (o gatilho do aviso à equipe)", async () => {
  const anuncia = /vou (?:encaminhar|passar)/i;
  const casos: [MensagemAgente[], DadosAgente][] = [
    [pilotoAbertura, {}],
    [pilotoAbertura, fichaAntiga],
    [aberturaAnuncio, {}],
    [meioSequencia, {}],
    [[{ role: "user", content: "Quero falar com uma pessoa" }], {}],
    [[{ role: "user", content: "Quero revender. Sou Ana, de Salvador BA, vendo doces" }], {}],
  ];
  for (const falha of [
    () => gateway.mockRejectedValue(timeout()),
    () => gateway.mockResolvedValue(encaminhaSemDados),
  ]) {
    for (const [mensagens, dados] of casos) {
      falha();
      const r = await turnoWorker(mensagens, dados);
      if (anuncia.test(r.resposta)) expect(r).toMatchObject({ estado: "humano", encaminhar: true });
      else expect(r.encaminhar).toBe(false);
    }
  }
});
