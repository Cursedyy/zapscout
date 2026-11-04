import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), row: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.row }) }) }),
  },
}));
import { getLockedUntil, registerFailure, lockoutMessage } from "./login-lockout.server";

const now = new Date("2026-11-04T12:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe("timeout fixo de login", () => {
  it("limita bloqueio legado de 24h a um minuto desde a última falha", async () => {
    mocks.row.mockResolvedValue({
      data: { last_failed_at: now.toISOString(), locked_until: "2026-11-05T12:00:00Z" },
      error: null,
    });
    expect(await getLockedUntil("lider@example.com")).toEqual(new Date(now.getTime() + 60_000));
    vi.advanceTimersByTime(59_999);
    expect(await getLockedUntil("lider@example.com")).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(await getLockedUntil("lider@example.com")).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("não reinicia a espera ao consultar bloqueios antigos", async () => {
    mocks.row.mockResolvedValue({
      data: { last_failed_at: "2026-11-04T11:50:00Z", locked_until: "2026-11-05T12:00:00Z" },
      error: null,
    });
    expect(await getLockedUntil("lider@example.com")).toBeNull();
  });
  it("mantém contas abaixo do limiar liberadas", async () => {
    mocks.row.mockResolvedValue({
      data: { last_failed_at: now.toISOString(), locked_until: null },
      error: null,
    });
    expect(await getLockedUntil("lider@example.com")).toBeNull();
  });
  it("devolve no máximo 60s ao registrar nova falha de login", async () => {
    mocks.rpc.mockResolvedValue({ data: "2026-11-05T12:00:00Z", error: null });
    expect(await registerFailure("lider@example.com")).toEqual(new Date(now.getTime() + 60_000));
    expect(lockoutMessage(new Date("2026-11-05T12:00:00Z"))).toContain("1 min");
  });
  it("preserva a ausência de bloqueio antes do limiar", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await registerFailure("lider@example.com")).toBeNull();
  });
  it("preserva bloqueios progressivos na recuperação de senha", async () => {
    mocks.rpc.mockResolvedValue({ data: "2026-11-05T12:00:00Z", error: null });
    expect(await getLockedUntil("lider@example.com", "pwreset")).toEqual(
      new Date("2026-11-05T12:00:00Z"),
    );
    expect(await registerFailure("lider@example.com", "pwreset")).toEqual(
      new Date("2026-11-05T12:00:00Z"),
    );
    expect(mocks.row).not.toHaveBeenCalled();
  });
});
