import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import readXlsxFile from "read-excel-file/node";
import { describe, it, expect } from "vitest";
import { cnpjValido, prepararBaseCarteira, lerCsvCarteira } from "./mimo-carteira-importacao";
describe("prévia da carteira", () => {
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
      mkdirSync(".cache", { recursive: true });
      writeFileSync(".cache/mimo-carteira-preflight.json", JSON.stringify(resumo, null, 2));
      console.info("Prévia da planilha:", resumo);
    },
    30000,
  );
});
