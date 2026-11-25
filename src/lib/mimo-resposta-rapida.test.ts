import { expect, it } from "vitest";
import { RESPOSTA_RAPIDA_MIMO, respostaRapidaMimo } from "./mimo-resposta-rapida";
it("personaliza com nome/empresa do contexto explícito sem inferir o negócio", () => {
  const a = respostaRapidaMimo({ nomeContato: "Érica Lima", nomeEmpresa: "Empório A" });
  const b = respostaRapidaMimo({ nomeContato: "Bruno Silva", nomeEmpresa: "Mercado B" });
  expect(a.texto).toBe(
    "Olá, Érica! Posso te ajudar com o catálogo, as opções de produtos e as condições para o primeiro pedido de Empório A.",
  );
  expect(b.texto).toContain("Olá, Bruno!");
  expect(b.texto).toContain("Mercado B");
  expect(b.texto).not.toContain("Érica");
  expect(b.texto).not.toContain("Empório A");
});
it("preserva o modelo e avisa quando faltam campos", () => {
  const r = respostaRapidaMimo({});
  expect(r.texto).toBe(`Olá! ${RESPOSTA_RAPIDA_MIMO}`);
  expect(r.aviso).toContain("saudação neutra");
  expect(r.aviso).toContain("Empresa não informada");
});
it("não usa empresa como nome de pessoa e normaliza controles sem inserir conteúdo externo", () => {
  const r = respostaRapidaMimo({ nomeContato: "123", nomeEmpresa: " Mercado\nB " });
  expect(r.texto).toMatch(/^Olá! /);
  expect(r.texto).toContain("Mercado B");
  expect(r.texto).not.toContain("\n");
  expect(respostaRapidaMimo({ nomeEmpresa: "x".repeat(201) }).texto).toBe(
    `Olá! ${RESPOSTA_RAPIDA_MIMO}`,
  );
});
