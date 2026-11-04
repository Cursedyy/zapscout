import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  log: vi.fn(),
  locked: vi.fn(),
  failures: vi.fn(),
  verify: vi.fn(),
  challenge: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://example.com", { headers: { "cf-connecting-ip": "192.0.2.1" } }),
}));
vi.mock("@/lib/rate-limit.server", () => ({ checkRateLimit: mocks.limit }));
vi.mock("@/lib/security-log.server", () => ({ logSecurityEvent: mocks.log }));
vi.mock("@/lib/login-lockout.server", () => ({
  getLockedUntil: mocks.locked,
  getFailedCount: mocks.failures,
  lockoutMessage: () => "Aguarde 1 minuto",
}));
vi.mock("@/lib/captcha.server", () => ({
  createChallenge: mocks.challenge,
  verifyChallenge: mocks.verify,
}));
import { precheckSignup, precheckLogin } from "./auth-precheck.functions";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.limit.mockResolvedValue(true);
  mocks.locked.mockResolvedValue(null);
  mocks.failures.mockResolvedValue(0);
  mocks.challenge.mockReturnValue({ question: "2 + 2", token: "mock" });
});
afterEach(() => vi.useRealTimers());
describe("cadastro sem limite de tentativas", () => {
  it("permite repetições pelo mesmo email e IP mesmo com cotas antigas esgotadas", async () => {
    mocks.limit.mockResolvedValue(false);
    for (let i = 0; i < 30; i++) {
      expect((await precheckSignup({ data: { email: "lider@example.com" } })).ok).toBe(true);
    }
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("continua bloqueando a isca preenchida e registra o motivo", async () => {
    vi.useFakeTimers();
    const attempt = precheckSignup({ data: { email: "bot@example.com", honeypot: "spam" } });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await attempt).ok).toBe(false);
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ reason: "signup_honeypot" }));
  });
});

describe("login com janela de um minuto", () => {
  it("preserva limites por IP e email com janela de 60 segundos", async () => {
    expect((await precheckLogin({ data: { email: "lider@example.com" } })).ok).toBe(true);
    expect(mocks.limit).toHaveBeenNthCalledWith(
      1,
      "login:minute:ip:192.0.2.1",
      5,
      60,
      expect.any(Object),
    );
    expect(mocks.limit).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^login:minute:email:/),
      8,
      60,
      expect.any(Object),
    );
  });
  it("informa um minuto quando o limite de IP é atingido", async () => {
    mocks.limit.mockResolvedValueOnce(false);
    expect(await precheckLogin({ data: { email: "lider@example.com" } })).toMatchObject({
      ok: false,
      error: expect.stringContaining("1 minuto"),
    });
  });
  it("continua bloqueando excesso de tentativas por email em IPs diferentes", async () => {
    mocks.limit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await precheckLogin({ data: { email: "lider@example.com" } })).ok).toBe(false);
  });
  it("mantém o desafio após falhas repetidas", async () => {
    mocks.failures.mockResolvedValue(2);
    mocks.verify.mockResolvedValue(false);
    expect(await precheckLogin({ data: { email: "lider@example.com" } })).toMatchObject({
      ok: false,
      captcha: { token: "mock" },
    });
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("permite o desafio resolvido sem remover os limites de login", async () => {
    mocks.failures.mockResolvedValue(2);
    mocks.verify.mockResolvedValue(true);
    expect(
      (
        await precheckLogin({
          data: { email: "lider@example.com", captchaToken: "mock", captchaAnswer: "4" },
        })
      ).ok,
    ).toBe(true);
    expect(mocks.limit).toHaveBeenCalledTimes(2);
  });
});
