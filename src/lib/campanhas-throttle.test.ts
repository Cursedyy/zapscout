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

import {
  applyRetry,
  computeRetryBackoffMs,
  MAX_RETRY_ATTEMPTS,
} from "./campanhas-throttle";

describe("computeRetryBackoffMs", () => {
  it("dobra a cada tentativa começando em 60s", () => {
    expect(computeRetryBackoffMs(1)).toBe(60_000);
    expect(computeRetryBackoffMs(2)).toBe(120_000);
    expect(computeRetryBackoffMs(3)).toBe(240_000);
    expect(computeRetryBackoffMs(4)).toBe(480_000);
  });
  it("limita em maxMs (default 30min)", () => {
    expect(computeRetryBackoffMs(20)).toBe(1_800_000);
  });
  it("aceita base e max customizados", () => {
    expect(computeRetryBackoffMs(3, { baseMs: 1000, maxMs: 10_000 })).toBe(4000);
    expect(computeRetryBackoffMs(10, { baseMs: 1000, maxMs: 10_000 })).toBe(10_000);
  });
});

describe("applyRetry", () => {
  const now = 1_700_000_000_000;

  it("primeira falha: mantém pendente, agenda retry em 60s, attempts=1", () => {
    const { item, giveUp } = applyRetry(
      { status: "pendente" as const, attempts: 0 },
      now,
      "timeout",
    );
    expect(giveUp).toBe(false);
    expect(item.status).toBe("pendente");
    expect(item.attempts).toBe(1);
    expect(item.lastError).toBe("timeout");
    expect(Date.parse(item.nextRetryAt!)).toBe(now + 60_000);
  });

  it("segunda falha: backoff dobra para 2min", () => {
    const { item } = applyRetry(
      { status: "pendente" as const, attempts: 1 },
      now,
      "timeout",
    );
    expect(item.attempts).toBe(2);
    expect(Date.parse(item.nextRetryAt!)).toBe(now + 120_000);
  });

  it(`marca falha definitiva após ${MAX_RETRY_ATTEMPTS} tentativas`, () => {
    const { item, giveUp } = applyRetry(
      { status: "pendente" as const, attempts: MAX_RETRY_ATTEMPTS - 1 },
      now,
      "500 err",
    );
    expect(giveUp).toBe(true);
    expect(item.status).toBe("falha");
    expect(item.attempts).toBe(MAX_RETRY_ATTEMPTS);
    expect(item.nextRetryAt).toBeUndefined();
  });

  it("trunca lastError em 500 chars", () => {
    const longMsg = "x".repeat(1000);
    const { item } = applyRetry(
      { status: "pendente" as const },
      now,
      longMsg,
    );
    expect(item.lastError.length).toBe(500);
  });
});

describe("pickNextPendingIndex com nextRetryAt", () => {
  const now = 1_700_000_000_000;

  it("pula item com nextRetryAt no futuro", () => {
    const items = [
      { status: "enviado" as const },
      { status: "pendente" as const, nextRetryAt: new Date(now + 30_000).toISOString() },
      { status: "pendente" as const },
    ];
    expect(pickNextPendingIndex(items, now)).toBe(2);
  });

  it("aceita item cujo nextRetryAt já passou", () => {
    const items = [
      { status: "pendente" as const, nextRetryAt: new Date(now - 5_000).toISOString() },
      { status: "pendente" as const },
    ];
    expect(pickNextPendingIndex(items, now)).toBe(0);
  });

  it("retry não quebra o intervalo global — cron precisa apenas do shouldFire", () => {
    // Simula: 1 item falhou, agendado para retry em 1min. Cron roda a cada 1min.
    // Intervalo da campanha é 60/h (1min). O item já vai estar liberado no próximo tick,
    // mas shouldFire também precisa liberar. Garante que ambos se combinam.
    const items = [
      { status: "pendente" as const, nextRetryAt: new Date(now).toISOString(), attempts: 1 },
    ];
    // 60s após último envio: pode disparar E o retry venceu
    expect(shouldFire({ lastSentAt: now - 60_000, limitePorHora: 60, now })).toBe(true);
    expect(pickNextPendingIndex(items, now)).toBe(0);
    // 30s após último envio: intervalo bloqueia mesmo com item disponível
    expect(shouldFire({ lastSentAt: now - 30_000, limitePorHora: 60, now: now - 30_000 })).toBe(false);
  });
});
