import { it, expect, vi } from "vitest";
import { instanciaComercialMimo } from "./mimo-ia-isolamento.server";
import type { SupabaseClient } from "@supabase/supabase-js";
it("bloqueia IA pessoal por dono e hash da credencial, inclusive lotes antigos", async () => {
  const eq = vi.fn().mockReturnThis(),
    select = vi.fn().mockReturnThis(),
    maybeSingle = vi.fn(async () => ({ data: { id: "v" }, error: null }));
  const q = { eq, select, maybeSingle };
  const db = { from: vi.fn(() => q) } as unknown as SupabaseClient;
  expect(await instanciaComercialMimo(db, "owner", "token-sintetico")).toBe(true);
  expect(eq).toHaveBeenCalledWith("owner_id", "owner");
  expect(eq).toHaveBeenCalledWith("token_sha256", expect.stringMatching(/^[0-9a-f]{64}$/));
});
it("falha na consulta não libera envio pessoal", async () => {
  const q = {
    eq: () => q,
    select: () => q,
    maybeSingle: async () => ({ data: null, error: { code: "XX" } }),
  };
  const db = { from: () => q } as unknown as SupabaseClient;
  await expect(instanciaComercialMimo(db, "owner", "token")).rejects.toThrow("mimo_isolamento");
});
