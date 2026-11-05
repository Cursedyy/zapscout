import { it, expect } from "vitest";
import { proximoHorarioLembrete, preverLembreteMimo } from "./mimo-carrinhos-recuperacao";
it.each([
  ["2026-11-05T11:59:59Z", "2026-11-05T11:59:59.000Z"],
  ["2026-11-05T12:00:00Z", "2026-11-05T12:00:00.000Z"],
  ["2026-11-05T20:59:59Z", "2026-11-05T20:59:59.000Z"],
  ["2026-11-05T21:00:00Z", "2026-11-05T21:00:00.000Z"],
  ["2026-11-07T21:00:00Z", "2026-11-07T21:00:00.000Z"],
  ["2026-12-31T23:00:00Z", "2026-12-31T23:00:00.000Z"],
  ["2027-01-01T03:00:00Z", "2027-01-01T03:00:00.000Z"],
])("permite envios 24h sem deslocar o horário elegível: %s", (input, expected) => {
  expect(proximoHorarioLembrete(new Date(input)).toISOString()).toBe(expected);
});
const carrinho = {
  atualizadoEm: "2026-11-05T18:00:00Z",
  temContato: true,
  temLink: true,
  temPedido: false,
};
it("conta duas horas da última atualização e não adianta para o instante da sincronização", () => {
  expect(preverLembreteMimo(carrinho, new Date("2026-11-05T18:30:00Z")).previstoPara).toBe(
    "2026-11-05T20:00:00.000Z",
  );
  expect(
    preverLembreteMimo(
      { ...carrinho, atualizadoEm: "2026-11-05T20:00:00Z" },
      new Date("2026-11-05T20:30:00Z"),
    ).previstoPara,
  ).toBe("2026-11-05T22:00:00.000Z");
});
it("não apresenta horário passado como agendamento e mantém prévia sem fila", () => {
  const r = preverLembreteMimo(carrinho, new Date("2026-11-06T13:00:00Z"));
  expect(r.previstoPara).toBe("2026-11-06T13:00:00.000Z");
  expect(r.motivo).toContain("Estimativa pela data do carrinho");
});
it.each([
  { temPedido: true },
  { temContato: false },
  { temLink: false },
  { atualizadoEm: "inválido" },
  { atualizadoEm: "2026-11-07T13:00:00Z" },
  { atualizadoEm: "2026-09-01T13:00:00Z" },
])("bloqueia prévia insegura: %j", (extra) => {
  expect(
    preverLembreteMimo({ ...carrinho, ...extra }, new Date("2026-11-06T13:00:00Z")).previstoPara,
  ).toBeNull();
});
it("rejeita data inválida e não modifica o objeto recebido", () => {
  const date = new Date("2026-11-05T23:00:00Z"),
    before = date.getTime();
  proximoHorarioLembrete(date);
  expect(date.getTime()).toBe(before);
  expect(() => proximoHorarioLembrete(new Date("inválido"))).toThrow("Data inválida");
});
