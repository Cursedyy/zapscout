import { describe, it, expect } from "vitest";

import { isCelularBR, onlyDigits } from "./telefone";

describe("isCelularBR", () => {
  it("aceita celular com 55 + DDD + 9 + 8 dígitos", () => {
    expect(isCelularBR("5553991635302")).toBe(true);
  });

  it("aceita celular sem código do país", () => {
    expect(isCelularBR("53991635302")).toBe(true);
  });

  it("aceita celular formatado com símbolos", () => {
    expect(isCelularBR("+55 (53) 99163-5302")).toBe(true);
  });

  it("rejeita fixo com 55 + DDD + 8 dígitos", () => {
    expect(isCelularBR("555332254488")).toBe(false);
  });

  it("rejeita fixo sem código do país", () => {
    expect(isCelularBR("5332254488")).toBe(false);
  });

  it("rejeita string vazia ou nula", () => {
    expect(isCelularBR("")).toBe(false);
    expect(isCelularBR(null)).toBe(false);
    expect(isCelularBR(undefined)).toBe(false);
  });

  it("rejeita número curto demais", () => {
    expect(isCelularBR("123")).toBe(false);
  });

  it("rejeita 11 dígitos locais sem o 9 na posição certa", () => {
    expect(isCelularBR("53881635302")).toBe(false);
  });
});

describe("onlyDigits (regressão)", () => {
  it("mantém comportamento existente", () => {
    expect(onlyDigits("+55 (53) 99163-5302")).toBe("5553991635302");
  });
});
