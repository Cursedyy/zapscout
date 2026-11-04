import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import readXlsxFile, { readSheetNames } from "read-excel-file/node";
import { describe, it, expect } from "vitest";
import {
  cnpjValido,
  prepararBaseCarteira,
  lerCsvCarteira,
  mapeamentoInicial,
  lerAbaCarteira,
} from "./mimo-carteira-importacao";
describe("prévia da carteira", () => {
  it("encontra a aba Unidades após uma aba de resumo e mapeia a planilha da Cia da Saúde", async () => {
    const abas = {
      Planilha1: [
        ["Rótulos de Linha", "Contagem de CNPJ"],
        ["Resumo", 144],
      ],
      Unidades: [
        ["Nome Fantasia", "Razão Social", "CNPJ", "UF", "Municipio"],
        ["CIA 001 CRICIUMA TERMINAL", "Empresa Teste Ltda", "11222333000181", "SC", "Criciúma"],
      ],
    };
    const rows = await lerAbaCarteira(
      Object.keys(abas),
      async (aba) => abas[aba as keyof typeof abas],
    );
    const map = mapeamentoInicial(rows[0] as string[]);
    const [linha] = prepararBaseCarteira(rows, map);
    expect(map.nome).toBe("Nome Fantasia");
    expect(map.cidade).toBe("Municipio");
    expect(linha.unidade.nome).toBe("CIA 001 CRICIUMA TERMINAL");
    expect(linha.unidade.cidade).toBe("Criciúma");
    expect(linha.problemas).toEqual([]);
  });
  it("preserva Base Potencial quando há mais de uma aba de unidades", async () => {
    const visitadas: string[] = [];
    const rows = await lerAbaCarteira(["Unidades", "Base Potencial"], async (aba) => {
      visitadas.push(aba);
      return [
        ["CNPJ", "Franquia"],
        ["", aba],
      ];
    });
    expect(visitadas).toEqual(["Base Potencial"]);
    expect(rows[1][1]).toBe("Base Potencial");
  });
  it("explica quando nenhuma aba contém unidades", async () => {
    await expect(lerAbaCarteira(["Resumo"], async () => [["Total", "Contagem"]])).rejects.toThrow(
      "Nenhuma aba contém cabeçalhos de unidades",
    );
  });
  it.each([
    ["BIO MUNDO", "Bio Mundo"],
    ["FIT LAND", "Fitland"],
    ["fitland", "Fitland"],
    ["cia da saude", "Cia da Saúde"],
    ["CIA DA SAÚDE", "Cia da Saúde"],
    [" DIVINA   TERRA ", "Divina Terra"],
  ])("lê a rede %s da coluna Franquia automaticamente", (origem, rede) => {
    const [l] = prepararBaseCarteira([
      ["CNPJ", "Franquia"],
      ["", origem],
    ]);
    expect(l.unidade.rede).toBe(rede);
    expect(l.originais.Franquia).toBe(origem.trim());
  });
  it("prioriza uma coluna REDE explícita e preserva outras redes declaradas", () => {
    const rows = [
      ["CNPJ", "Franquia", "REDE"],
      ["", "BIO MUNDO", "Outra Rede"],
    ];
    expect(mapeamentoInicial(rows[0]).rede).toBe("REDE");
    expect(prepararBaseCarteira(rows)[0].unidade.rede).toBe("Outra Rede");
  });
  it("não transforma parceiros independentes ou nomes parecidos em redes", () => {
    for (const nome of ["Empório Centro", "Bio Mundo Independente"]) {
      const [l] = prepararBaseCarteira([
        ["CNPJ", "Franquia"],
        ["", nome],
      ]);
      expect(l.unidade.nome).toBe(nome);
      expect(l.unidade.rede).toBe("");
    }
  });
  it("respeita a opção de não importar a coluna de rede", () => {
    const rows = [
      ["CNPJ", "Franquia"],
      ["", "BIO MUNDO"],
    ];
    const map = { ...mapeamentoInicial(rows[0]), rede: "" };
    expect(prepararBaseCarteira(rows, map)[0].unidade.rede).toBe("");
  });
  it("valida os dois dígitos de CNPJ e rejeita repetição", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });
  it("preserva a classificação sem assumir que o nome da loja é uma rede", () => {
    const rows = [
      ["Título"],
      ["CNPJ", "Franquia", "Razão Social", "Prioridade"],
      ["11222333000181", "Loja Centro", "Empresa Centro", "B"],
    ];
    const [r] = prepararBaseCarteira(rows);
    expect(r.unidade.classe).toBe("B");
    expect(r.unidade.rede).toBe("");
    expect(r.unidade.nome).toBe("Loja Centro");
    expect(r.linha).toBe(3);
  });
  it("sinaliza CNPJ repetido e mantém as linhas para revisão", () => {
    const r = prepararBaseCarteira([
      ["CNPJ", "Razão Social"],
      ["11222333000181", "Loja A"],
      ["11222333000181", "Loja B"],
    ]);
    expect(r).toHaveLength(2);
    expect(r[1].problemas).toContain("CNPJ repetido: revisar antes de selecionar.");
  });
  it("não aceita arquivo sem os cabeçalhos esperados", () => {
    expect(() => prepararBaseCarteira([["Outro arquivo"]])).toThrow("Cabeçalhos");
  });
  it("preserva vírgulas e quebras de linha dentro de células CSV", () => {
    const rows = lerCsvCarteira(
      'CNPJ;Razão Social;Franquia\n11222333000181;"Empresa, Ltda";"Loja\nCentro"',
    );
    expect(rows[1][1]).toBe("Empresa, Ltda");
    expect(rows[1][2]).toBe("Loja\nCentro");
  });
  it("preserva canais de proprietário e comprador separadamente", () => {
    const [l] = prepararBaseCarteira([
      [
        "CNPJ",
        "Razão Social",
        "Proprietário",
        "WhatsApp — Proprietário",
        "Comprador",
        "E-mail — Comprador",
      ],
      ["11222333000181", "Loja Teste", "Ana", "41999999999", "Bia", "bia@example.test"],
    ]);
    expect(l.contatos).toHaveLength(2);
    expect(l.contatos[0].papel).toBe("Proprietário");
    expect(l.contatos[1].email).toBe("bia@example.test");
  });
  it.skipIf(!existsSync("CRM_OUTUBRO_26_RESUMO_VENDAS.xlsx"))(
    "confere a planilha fornecida sem modificá-la",
    async () => {
      const rows = await readXlsxFile("CRM_OUTUBRO_26_RESUMO_VENDAS.xlsx", {
        sheet: "Base Potencial",
      });
      const linhas = prepararBaseCarteira(rows);
      const resumo = {
        unidades: linhas.length,
        comProblemas: linhas.filter((l) => l.problemas.length).length,
        contatos: linhas.reduce((n, l) => n + l.contatos.length, 0),
        redesSugeridas: linhas.filter((l) => l.redeSugerida).length,
      };
      expect(linhas.length).toBeGreaterThan(2000);
      expect(linhas.every((l) => l.unidade.situacao === "Não abordado")).toBe(true);
      expect(linhas.filter((l) => l.unidade.rede).length).toBe(505);
      mkdirSync(".cache", { recursive: true });
      writeFileSync(".cache/mimo-carteira-preflight.json", JSON.stringify(resumo, null, 2));
      console.info("Prévia da planilha:", resumo);
    },
    30000,
  );
  it.skipIf(!process.env.MIMO_CARTEIRA_PLANILHA_CIA)(
    "lê uma planilha real da Cia da Saúde com abas de resumo e unidades",
    async () => {
      const arquivo = process.env.MIMO_CARTEIRA_PLANILHA_CIA!;
      const abas = await readSheetNames(arquivo);
      const rows = await lerAbaCarteira(abas, (aba) => readXlsxFile(arquivo, { sheet: aba }));
      const linhas = prepararBaseCarteira(rows);
      expect(linhas.length).toBeGreaterThan(100);
      expect(linhas[0].unidade.nome).toMatch(/^CIA \d+/);
      expect(linhas[0].unidade.cidade).toBeTruthy();
    },
    30000,
  );
});
