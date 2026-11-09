import { describe, it, expect } from "vitest";
import {
  configInicialAgente as c,
  finalizarResultadoAgente as finalizar,
  motivoObrigatorioAgente,
  horarioHumanoAberto,
} from "./mimo-agente";
const msg = (content: string) => [{ role: "user" as const, content }];
const r = { resposta: "Qual é o nome do empório?", dados: {}, encaminhar: false, motivo: "" };
describe("pré-qualificação", () => {
  it("coleta informações antecipadas e conserva evidências, sem inferir UF", () => {
    const texto = "Tenho um empório em Porto Alegre e queria conhecer os produtos.";
    const v = finalizar(
      c,
      msg(texto),
      {},
      {
        ...r,
        dados: {
          estabelecimento: { valor: "empório", evidencia: "Tenho um empório" },
          cidade_uf: { valor: "Porto Alegre", evidencia: "em Porto Alegre" },
          compras: { valor: "Dono", evidencia: "sou o dono" },
        },
      },
    );
    expect(v.dados.estabelecimento?.valor).toBe("empório");
    expect(v.dados.cidade_uf?.valor).toBe("Porto Alegre");
    expect(v.dados.compras).toBeUndefined();
    expect(v.estado).toBe("agente");
  });
  it("aceita correção explícita sem escrever no CRM", () => {
    const v = finalizar(
      c,
      msg("Na verdade, meu nome é Maria"),
      { nome: { valor: "Ana", evidencia: "sou Ana" } },
      { ...r, dados: { nome: { valor: "Maria", evidencia: "meu nome é Maria" } } },
    );
    expect(v.dados.nome?.valor).toBe("Maria");
  });
  it.each([
    "Quero falar com uma pessoa",
    "Qual o preço?",
    "Qual o frete?",
    "Tenho uma reclamação",
    "[áudio]",
  ])("encaminha por código: %s", (texto) => {
    expect(finalizar(c, msg(texto), {}, r).estado).toBe("humano");
  });
  it("pedido de parada prevalece", () =>
    expect(finalizar(c, msg("Não quero mais mensagens"), {}, r).estado).toBe("bloqueada"));
  it("não confunde parece com pare", () =>
    expect(motivoObrigatorioAgente("Parece interessante")).toBeNull());
  it("promessa de encaminhamento não depende de flag", () =>
    expect(
      finalizar(c, msg("Olá"), {}, { ...r, resposta: "Vou passar sua conversa para a equipe" })
        .estado,
    ).toBe("humano"));
  it("pré-qualificação completa continua pendente de revisão", () => {
    const dados = { nome: { valor: "Ana", evidencia: "Ana" } };
    const v = finalizar({ ...c, campos: ["nome"] }, msg("Ana"), {}, { ...r, dados });
    expect(v.estado).toBe("humano");
    expect(v.motivo).toBe("pre_qualificacao_pendente_revisao");
    expect(v.resumo).toContain("pendente de revisão");
  });
  it("rejeita links ou quantias criados pelo modelo", () =>
    expect(() =>
      finalizar(c, msg("oi"), {}, { ...r, resposta: "https://exemplo.invalid" }),
    ).toThrow());
  it("horário humano não limita atendimento automático", () => {
    const cfg = { ...c, horarios: [{ dia: 1, inicio: "09:00", fim: "18:00" }] };
    expect(horarioHumanoAberto(cfg, new Date("2026-11-09T13:00:00Z"))).toBe(true);
    expect(horarioHumanoAberto(cfg, new Date("2026-11-09T22:00:00Z"))).toBe(false);
  });
});
