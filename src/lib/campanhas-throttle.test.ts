import { describe, it, expect } from "vitest";
import {
  intervaloMs,
  shouldFire,
  pickNextPendingIndex,
  simulateCampanhaTicks,
} from "./campanhas-throttle";

describe("intervaloMs", () => {
  it("60/h => 60_000ms", () => {
    expect(intervaloMs(60)).toBe(60_000);
  });
  it("20/h => 180_000ms (3min)", () => {
    expect(intervaloMs(20)).toBe(180_000);
  });
  it("limite 0 ou negativo => trata como 1/h", () => {
    expect(intervaloMs(0)).toBe(3_600_000);
    expect(intervaloMs(-5)).toBe(3_600_000);
  });
  it("nunca abaixo de 1000ms", () => {
    expect(intervaloMs(10_000_000)).toBe(1_000);
  });
});

describe("shouldFire", () => {
  const base = 1_700_000_000_000;

  it("dispara na primeira vez (lastSentAt=null)", () => {
    expect(shouldFire({ lastSentAt: null, limitePorHora: 20, now: base })).toBe(true);
  });

  it("dispara na primeira vez (lastSentAt=0)", () => {
    expect(shouldFire({ lastSentAt: 0, limitePorHora: 20, now: base })).toBe(true);
  });

  it("bloqueia se o intervalo ainda não passou", () => {
    // 20/h = 180s. Passou 60s => bloqueia.
    expect(
      shouldFire({ lastSentAt: base - 60_000, limitePorHora: 20, now: base }),
    ).toBe(false);
  });

  it("libera exatamente no fim do intervalo", () => {
    expect(
      shouldFire({ lastSentAt: base - 180_000, limitePorHora: 20, now: base }),
    ).toBe(true);
  });

  it("libera após o fim do intervalo", () => {
    expect(
      shouldFire({ lastSentAt: base - 200_000, limitePorHora: 20, now: base }),
    ).toBe(true);
  });
});

describe("pickNextPendingIndex", () => {
  it("pula enviados/falha/pulado e retorna o primeiro pendente", () => {
    const items = [
      { status: "enviado" as const },
      { status: "falha" as const },
      { status: "pulado" as const },
      { status: "pendente" as const },
      { status: "pendente" as const },
    ];
    expect(pickNextPendingIndex(items)).toBe(3);
  });

  it("retorna -1 quando não há pendentes", () => {
    expect(
      pickNextPendingIndex([
        { status: "enviado" as const },
        { status: "enviado" as const },
      ]),
    ).toBe(-1);
  });
});

describe("simulateCampanhaTicks — respeita o intervalo em múltiplos ticks", () => {
  const startAt = 1_700_000_000_000;

  it("campanha 60/h (1 por min) em ticks de 1min => 1 disparo por tick", () => {
    const out = simulateCampanhaTicks({
      limitePorHora: 60,
      itemsPendentes: 10,
      startAt,
      tickMs: 60_000,
      ticks: 10,
    });
    expect(out.length).toBe(10);
    for (let i = 1; i < out.length; i++) {
      expect(out[i] - out[i - 1]).toBeGreaterThanOrEqual(60_000);
    }
  });

  it("campanha 20/h (1 a cada 3min) em ticks de 1min => 1 disparo a cada 3 ticks", () => {
    const out = simulateCampanhaTicks({
      limitePorHora: 20,
      itemsPendentes: 5,
      startAt,
      tickMs: 60_000,
      ticks: 15,
    });
    // 15 ticks * 1min = 15min. Intervalo=3min => até 5 disparos (tick 0, 3, 6, 9, 12).
    expect(out.length).toBe(5);
    for (let i = 1; i < out.length; i++) {
      expect(out[i] - out[i - 1]).toBeGreaterThanOrEqual(180_000);
    }
  });

  it("nunca ultrapassa o número de itens pendentes", () => {
    const out = simulateCampanhaTicks({
      limitePorHora: 60,
      itemsPendentes: 3,
      startAt,
      tickMs: 60_000,
      ticks: 20,
    });
    expect(out.length).toBe(3);
  });

  it("re-invocações no mesmo tick não geram disparos duplicados (idempotência)", () => {
    // Simula duas 'abas' ou dois workers rodando a mesma checagem no mesmo instante,
    // após um disparo já persistido.
    const now = startAt + 30_000; // 30s após último envio
    const lastSentAt = startAt;

    const a = shouldFire({ lastSentAt, limitePorHora: 20, now });
    const b = shouldFire({ lastSentAt, limitePorHora: 20, now });
    expect(a).toBe(false);
    expect(b).toBe(false);
  });
});

describe("cenário de várias campanhas concorrentes", () => {
  const startAt = 1_700_000_000_000;

  it("cada campanha respeita o próprio intervalo independentemente", () => {
    // 3 campanhas: 60/h, 30/h, 20/h. Cada uma com 5 leads pendentes.
    const configs = [
      { limitePorHora: 60, itemsPendentes: 5 },
      { limitePorHora: 30, itemsPendentes: 5 },
      { limitePorHora: 20, itemsPendentes: 5 },
    ];

    const resultados = configs.map((c) =>
      simulateCampanhaTicks({
        ...c,
        startAt,
        tickMs: 60_000,
        ticks: 30, // 30 min
      }),
    );

    // Em 30min, 60/h envia 5 (tem só 5 itens), 30/h envia 5 (tem só 5), 20/h envia 5.
    expect(resultados[0].length).toBe(5);
    expect(resultados[1].length).toBe(5);
    expect(resultados[2].length).toBe(5);

    // Cada campanha respeita seu próprio intervalo.
    const checks = [
      { r: resultados[0], min: 60_000 },
      { r: resultados[1], min: 120_000 },
      { r: resultados[2], min: 180_000 },
    ];
    for (const { r, min } of checks) {
      for (let i = 1; i < r.length; i++) {
        expect(r[i] - r[i - 1]).toBeGreaterThanOrEqual(min);
      }
    }
  });
});
