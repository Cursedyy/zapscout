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
  ])("pede os dados antes de encaminhar: %s", (texto) => {
    expect(finalizar(c, msg(texto), {}, r)).toMatchObject({ estado: "agente", encaminhar: false });
  });
  it("pedido de parada prevalece", () =>
    expect(finalizar(c, msg("Não quero mais mensagens"), {}, r).estado).toBe("bloqueada"));
  it("não confunde parece com pare", () =>
    expect(motivoObrigatorioAgente("Parece interessante")).toBeNull());
  it("promessa de encaminhamento não depende de flag", () =>
    expect(
      finalizar(c, msg("Olá"), {}, { ...r, resposta: "Vou passar sua conversa para a equipe" })
        .estado,
    ).toBe("agente"));
  it("representante declarado recebe o formulário, mesmo citando valor mínimo", () => {
    const v = finalizar(c, msg("Sou representante e queria saber o valor do pedido mínimo"), {}, r);
    expect(v.estado).toBe("agente");
    expect(v.resposta).toContain("/representantes");
  });
  it("quem represento a marca também recebe o formulário de representante", () => {
    const v = finalizar(c, msg("Represento a marca em Minas e quero o cadastro"), {}, r);
    expect(v.estado).toBe("agente");
    expect(v.resposta).toContain("/representantes");
  });
  it("representante não cai na pré-qualificação pendente de revisão", () => {
    const dados = {
      nome: { valor: "Ana", evidencia: "Ana" },
      cidade_uf: { valor: "MG", evidencia: "Minas" },
      estabelecimento: { valor: "loja", evidencia: "loja" },
      revenda: { valor: "quero revender", evidencia: "quero revender" },
      problema: { valor: "pouca variedade", evidencia: "pouca variedade" },
      implicacao: { valor: "perco vendas", evidencia: "perco vendas" },
      necessidade: { valor: "ampliar o mix", evidencia: "ampliar o mix" },
    };
    const v = finalizar(c, msg("Sou representante, me manda o link do formulário"), {}, { ...r, dados }, new Date(), true);
    expect(v.estado).toBe("agente");
    expect(v.resposta).toContain("/representantes");
  });
  it("pré-qualificação completa continua pendente de revisão", () => {
    const valores = { nome:"Ana",cidade_uf:"RS",estabelecimento:"loja",revenda:"quero revender",problema:"pouca variedade",implicacao:"perco vendas",necessidade:"ampliar o mix" };
    const dados = Object.fromEntries(Object.entries(valores).map(([k,v])=>[k,{valor:v,evidencia:v}]));
    const v = finalizar(c, msg(Object.values(valores).join("; ")), {}, { ...r, dados }, new Date(), true);
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
