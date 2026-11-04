import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), log: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://example.com", { headers: { "cf-connecting-ip": "192.0.2.1" } }),
}));
vi.mock("@/lib/rate-limit.server", () => ({ checkRateLimit: mocks.limit }));
vi.mock("@/lib/security-log.server", () => ({ logSecurityEvent: mocks.log }));
import { precheckSignup } from "./auth-precheck.functions";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.limit.mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());
describe("limites de cadastro em rede compartilhada", () => {
  it("permite tentativas da equipe e preserva a proteção por email", async () => {
    const result = await precheckSignup({ data: { email: "lider@example.com" } });
    expect(result.ok).toBe(true);
    expect(mocks.limit).toHaveBeenNthCalledWith(
      1,
      "signup:ip:192.0.2.1",
      20,
      3600,
      expect.any(Object),
    );
    expect(mocks.limit).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^signup:email:/),
      2,
      86400,
      expect.any(Object),
    );
  });
  it("recusa o IP acima do limite sem consumir a cota do email", async () => {
    mocks.limit.mockResolvedValueOnce(false);
    expect((await precheckSignup({ data: { email: "lider@example.com" } })).ok).toBe(false);
    expect(mocks.limit).toHaveBeenCalledTimes(1);
  });
  it("recusa tentativas acima da cota do email mesmo em uma rede liberada", async () => {
    mocks.limit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await precheckSignup({ data: { email: "lider@example.com" } })).ok).toBe(false);
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
