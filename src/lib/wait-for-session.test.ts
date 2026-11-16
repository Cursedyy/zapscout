import { afterEach, expect, it, vi } from "vitest";
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession } } }));
import { waitForSession } from "./wait-for-session";
afterEach(() => {
  vi.useRealTimers();
  getSession.mockReset();
});
it("retorna a sessão disponível sem esperar", async () => {
  getSession.mockResolvedValue({ data: { session: {} }, error: null });
  expect(await waitForSession(2000)).toBe(true);
});
it("respeita o prazo mesmo quando getSession nunca termina", async () => {
  vi.useFakeTimers();
  getSession.mockImplementation(() => new Promise(() => {}));
  const p = waitForSession(2000);
  await vi.advanceTimersByTimeAsync(2000);
  expect(await p).toBe(false);
  expect(getSession).toHaveBeenCalledTimes(1);
});
it("sessão ausente não causa uma última chamada sem prazo", async () => {
  vi.useFakeTimers();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  const p = waitForSession(200);
  await vi.advanceTimersByTimeAsync(200);
  expect(await p).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
