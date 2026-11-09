import { describe, expect, it, vi } from "vitest";
import {
  configAgenteSchema,
  configInicialAgente,
  finalizarResultadoAgente,
  promptAgente,
  respostaDeterministicaAgente,
  PERGUNTA_SUPORTE_AGENTE,
} from "./mimo-agente";
import { PERGUNTA_ESTADO_POLITICA, politicaComercialAgenteSchema } from "./mimo-agente-politica";
const gateway = vi.hoisted(() => vi.fn());
vi.mock("./ia.server", () => ({ chamarLovableAI: gateway }));
import { gerarRespostaAgente } from "./mimo-agente-modelo.server";
// Synthetic conditions: no real company prices, pilot phones or commercial documents.
const politica = {
  revisada: true,
  regioes: [{ ufs: ["ES"], minimoCentavos: 23000, frete: "CIF" as const }],
  demais: { minimoCentavos: 76000, frete: "FOB" as const },
  pix: true,
  cartao: { maxParcelas: 7, juros: "com_juros" as const },
  boleto: "analise_credito" as const,
  bonificacaoFrete: true,
};
const c = configAgenteSchema.parse({
  ...configInicialAgente,
  conhecimentoRevisado: true,
  politicaComercial: politica,
});
const msgs = (content: string) => [{ role: "user" as const, content }];
const responder = (content: string) => respostaDeterministicaAgente(c, msgs(content), {});

describe("política comercial revisada", () => {
  it("exige revisão do conhecimento e da política", () => {
    for (const cfg of [
      configInicialAgente,
      { ...c, conhecimentoRevisado: false },
      { ...c, politicaComercial: { ...politica, revisada: false } },
    ]) {
      expect(
        respostaDeterministicaAgente(cfg, msgs("Qual o mínimo e o frete no ES?"), {})?.motivo,
      ).toBe("condicao_comercial");
    }
  });
  it("responde por estado explícito sem consultar o modelo", async () => {
    gateway.mockClear();
    const r = await gerarRespostaAgente(
      c,
      msgs("Sou do Espírito Santo. Qual o mínimo e o frete?"),
      {},
    );
    expect(r.resposta).toMatch(/R\$\s230,00/);
    expect(r.resposta).toContain("O frete já está incluído (CIF).");
    expect(r.estado).toBe("agente");
    expect(gateway).not.toHaveBeenCalled();
  });
  it("usa a regra das demais localidades", () => {
    const r = responder("Qual o pedido mínimo e o frete para MG?");
    expect(r?.resposta).toMatch(/R\$\s760,00/);
    expect(r?.resposta).toContain("O frete fica por sua conta (FOB).");
  });
  it.each([
    "Qual o mínimo para Vitória?",
    "Sou parceiro Exemplo. Qual o frete?",
    "Meu DDD é 27. Qual o mínimo?",
    "Qual o mínimo para revenda?",
  ])("não infere estado: %s", (texto) =>
    expect(responder(texto)?.resposta).toBe(PERGUNTA_ESTADO_POLITICA),
  );
  it("retoma mínimo e frete depois da pergunta de estado", () => {
    const r = respostaDeterministicaAgente(
      c,
      [
        ...msgs("Qual o frete?"),
        { role: "assistant", content: PERGUNTA_ESTADO_POLITICA },
        { role: "user", content: "ES" },
      ],
      {},
    );
    expect(r?.resposta).toMatch(/R\$\s230,00/);
    expect(r?.resposta).toContain("CIF");
  });
  it.each([
    "Não sou de ES. Qual o frete?",
    "Qual o frete em ES ou MG?",
    "Se eu fosse de ES, qual o mínimo?",
  ])("pede esclarecimento em localização ambígua: %s", (texto) =>
    expect(responder(texto)?.resposta).toBe(PERGUNTA_ESTADO_POLITICA),
  );
  it("respeita o último estado explícito informado", () => {
    const r = respostaDeterministicaAgente(
      c,
      [
        ...msgs("Sou do ES"),
        { role: "assistant", content: "Qual sua dúvida?" },
        { role: "user", content: "Agora a entrega é em MG. Qual o frete?" },
      ],
      {},
    );
    expect(r?.resposta).toContain("FOB");
  });
  it("mantém juros e análise de crédito, sem inventar taxa", () => {
    const r = responder("Quais são as formas de pagamento?");
    expect(r?.resposta).toContain("Pix");
    expect(r?.resposta).toContain("até 7 vezes");
    expect(r?.resposta).toContain("com juros");
    expect(r?.resposta).toContain("análise de crédito");
    expect(r?.resposta).not.toContain("%");
  });
  it("menciona bonificação somente quando solicitada e em FOB", () => {
    expect(responder("Sou de MG. Vocês oferecem frete grátis?")?.resposta).toContain(
      "bonificação no frete",
    );
    expect(responder("Sou de MG. Qual o frete?")?.resposta).not.toContain("bonificação no frete");
    expect(responder("Sou do ES. Tem frete grátis?")?.resposta).not.toContain(
      "bonificação no frete",
    );
    expect(responder("Sou de MG. Vocês oferecem frete grátis?")?.resposta).toContain(
      "sem garantia de cobrir todo o custo",
    );
  });
  it.each([
    "Qual o preço do produto?",
    "Me dá desconto no pedido?",
    "Posso comprar abaixo do mínimo?",
    "Qual a taxa de juros do cartão?",
    "Quanto fica o valor da parcela?",
  ])("encaminha cotação e negociação: %s", (texto) =>
    expect(responder(texto)?.estado).toBe("humano"),
  );
  it("não aceita condições inventadas pelo modelo", () => {
    for (const resposta of [
      "Custa 999 reais.",
      "São 4 vezes sem juros.",
      "O frete é grátis.",
      "Aceitamos cartão.",
    ])
      expect(() =>
        finalizarResultadoAgente(
          c,
          msgs("Olá"),
          {},
          { resposta, dados: {}, encaminhar: false, motivo: "" },
        ),
      ).toThrow("agente_resposta_nao_aprovada");
  });
  it("não corta avisos financeiros no meio da frase", () => {
    const r = respostaDeterministicaAgente(
      { ...c, tamanho: 80 },
      msgs("Quais as formas de pagamento?"),
      {},
    );
    expect(r?.resposta.length).toBeLessThanOrEqual(80);
    expect(r?.resposta).not.toMatch(/Cartão.*até.*vezes,$/);
  });
  it("valida UF e não admite regiões sobrepostas", () => {
    expect(
      politicaComercialAgenteSchema.safeParse({
        ...politica,
        regioes: [{ ...politica.regioes[0], ufs: ["ZZ"] }],
      }).success,
    ).toBe(false);
    expect(
      politicaComercialAgenteSchema.safeParse({
        ...politica,
        regioes: [politica.regioes[0], politica.regioes[0]],
      }).success,
    ).toBe(false);
  });
});
describe("contexto e encaminhamento", () => {
  it("coleta quatro dados sem exigir empresa ou responsável por compras", () =>
    expect(configInicialAgente.campos).toEqual([
      "nome",
      "cidade_uf",
      "estabelecimento",
      "revenda",
    ]));
  it("acolhe pessoa física e quem ainda vai começar", () =>
    expect(
      responder("Sou pessoa física, não tenho empresa nem CNPJ e quero começar a revender"),
    ).toBeNull());
  it("encaminha consumo próprio sem exigir qualificação", () => {
    const r = responder("Quero comprar para mim");
    expect(r?.motivo).toBe("consumo_proprio");
    expect(r?.resumo).toContain("Assunto: consumo");
  });
  it("identifica brevemente o suporte e encaminha na resposta seguinte", () => {
    expect(responder("Preciso de suporte")?.resposta).toBe(PERGUNTA_SUPORTE_AGENTE);
    const r = respostaDeterministicaAgente(
      c,
      [
        ...msgs("Preciso de suporte"),
        { role: "assistant", content: PERGUNTA_SUPORTE_AGENTE },
        { role: "user", content: "Veio quebrado" },
      ],
      {},
    );
    expect(r?.motivo).toBe("suporte");
    expect(r?.estado).toBe("humano");
  });
  it("encaminha suporte já explicado sem perguntar novamente", () =>
    expect(responder("Meu pedido não chegou")?.motivo).toBe("suporte"));
  it("aceita recusa de dados sem insistir", () =>
    expect(responder("Prefiro não informar meu nome")?.motivo).toBe("recusa_dados"));
  it("parada e pedido de humano prevalecem sobre a política", () => {
    expect(responder("Não quero mais mensagens, qual o frete?")?.estado).toBe("bloqueada");
    expect(responder("Quero falar com uma pessoa sobre o mínimo")?.motivo).toBe(
      "atendimento_humano",
    );
  });
  it("não interpreta alergênicos ou inventa especificação de produto", () =>
    expect(responder("Tem glúten ou leite?")?.motivo).toBe("duvida_produto"));
  it("não manda números internos ou IDs de materiais ao modelo", () => {
    const p = promptAgente(
      { ...c, pilotos: ["5511999990001"], materiais: ["10000000-0000-4000-8000-000000000001"] },
      {},
    );
    expect(p).not.toContain("5511999990001");
    expect(p).not.toContain("10000000-0000-4000-8000-000000000001");
    expect(p).toContain("CONSUMO PRÓPRIO");
    expect(p).toContain("não exija CNPJ");
  });
});

it("mantém o estado informado quando a alternativa é sobre pagamento", () => {
  expect(responder("Sou do ES. Posso pagar por Pix ou cartão? Qual o mínimo?")?.resposta).toMatch(
    /R\$\s230,00/,
  );
});
it("encaminha quando a forma solicitada não está aprovada", () => {
  const r = respostaDeterministicaAgente(
    { ...c, politicaComercial: { ...politica, pix: false } },
    msgs("Aceita Pix?"),
    {},
  );
  expect(r?.motivo).toBe("condicao_comercial");
});
it("preserva revisão humana ao concluir os quatro campos", () => {
  const texto = "Sou Pessoa Exemplo, em MG, vendo online e quero conhecer os produtos";
  const dados = {
    nome: { valor: "Pessoa Exemplo", evidencia: "Sou Pessoa Exemplo" },
    cidade_uf: { valor: "MG", evidencia: "em MG" },
    estabelecimento: { valor: "vendo online", evidencia: "vendo online" },
    revenda: { valor: "conhecer os produtos", evidencia: "quero conhecer os produtos" },
  };
  expect(
    finalizarResultadoAgente(
      c,
      msgs(texto),
      {},
      { resposta: "Obrigado pelas informações.", dados, encaminhar: false, motivo: "" },
    ).motivo,
  ).toBe("pre_qualificacao_pendente_revisao");
});

it("não confunde palavras comuns com siglas de estado", () => {
  expect(responder("Gostaria de saber se tem frete para se tornar revendedor")?.resposta).toBe(
    PERGUNTA_ESTADO_POLITICA,
  );
});
it("aceita UF minúscula em resposta direta ou endereço explícito", () => {
  expect(responder("moro no es, qual o mínimo?")?.resposta).toContain("CIF");
});
it("não confunde Mato Grosso do Sul com Mato Grosso", () => {
  expect(responder("Sou de Mato Grosso do Sul. Qual o mínimo?")?.resposta).toContain("Para MS");
});

it("não confunde pedido de revenda como pessoa física com pedido de humano", () => {
  expect(responder("Quero começar a revender como pessoa física")).toBeNull();
});

it("preserva a ressalva da bonificação inteira mesmo com pouco espaço", () => {
  const r = respostaDeterministicaAgente(
    { ...c, tamanho: 140 },
    msgs("Sou de MG. Qual o mínimo e tem frete grátis?"),
    {},
  );
  expect(r?.resposta.length).toBeLessThanOrEqual(140);
  expect(r?.resposta).toContain("FOB");
  expect(r?.resposta).not.toContain("bonificação");
});
it("mantém parcelamento sem juros somente quando aprovado", () => {
  const r = respostaDeterministicaAgente(
    { ...c, politicaComercial: { ...politica, cartao: { maxParcelas: 3, juros: "sem_juros" } } },
    msgs("Aceita cartão?"),
    {},
  );
  expect(r?.resposta).toContain("até 3 vezes, sem juros");
});
it("orienta conversa natural sem fingir ser humano", () => {
  const p = promptAgente(c, {});
  expect(p).toContain("apresentações repetidas");
  expect(p).toContain("não finja ser humano");
});
