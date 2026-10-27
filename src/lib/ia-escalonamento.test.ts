import { describe, expect, it } from "vitest";
import { estiloHumano, pedeHumano, prometeEncaminhar, resolverDestino, tempoDigitando } from "./ia-escalonamento";

const destinos = [
  { nome: "Matheus", assunto: "vendas e pedidos", telefone: "51999990001" },
  { nome: "Eduardo", assunto: "representante comercial", telefone: "51999990002" },
];

describe("ia escalonamento", () => {
  it("detecta pedido de humano", () => {
    expect(pedeHumano("quero falar com um atendente")).toBe(true);
    expect(pedeHumano("posso falar com uma pessoa?")).toBe(true);
    expect(pedeHumano("vc é um robô?")).toBe(true);
    expect(pedeHumano("tenho uma loja em Guaíba")).toBe(false);
  });
  it("detecta promessa de encaminhar", () => {
    expect(prometeEncaminhar("Já vou passar seus dados pro nosso consultor")).toBe(true);
    expect(prometeEncaminhar("Você tem loja física?")).toBe(false);
  });
  it("representante comercial vai para Eduardo", () => {
    expect(resolverDestino(destinos, null, "quero ser representante de vocês")?.nome).toBe("Eduardo");
    expect(resolverDestino(destinos, "eduardo", "oi")?.nome).toBe("Eduardo");
  });
  it("vendas vai para Matheus e sem regra usa padrão", () => {
    expect(resolverDestino(destinos, null, "quero fazer um pedido")?.nome).toBe("Matheus");
    expect(resolverDestino(destinos, null, "oi tudo bem")).toBeNull();
  });
  it("remove emojis e travessões", () => {
    expect(estiloHumano("Perfeito, Suelen! 😊 Aqui é da MiMo — Esse Pode!")).toBe("Perfeito, Suelen! Aqui é da MiMo, Esse Pode!");
  });
  it("digitando entre 1,5s e 8s", () => {
    expect(tempoDigitando("oi")).toBe(1500);
    expect(tempoDigitando("x".repeat(1000))).toBe(8000);
  });
});
