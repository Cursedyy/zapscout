import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarLeadRecebidoIA } from "./ia-inbound-lead.server";

const userId = "939bd727-9bee-4ba8-9d2c-b66d4746c3bf";
function mockDb(ativa: boolean) {
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: "lead-novo" }, error: null }) }) }));
  const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: { ativa }, error: null }) }));
  const db = { from: (table: string) => table === "ia_config" ? { select: () => ({ eq }) } : { insert } };
  return { db: db as unknown as SupabaseClient, insert, eq };
}

describe("contatos recebidos pela IA", () => {
  it("cria contato sem CRM prévio quando a IA está ativa, somente para o dono da instância", async () => {
    const { db, insert, eq } = mockDb(true);
    expect(await criarLeadRecebidoIA(db, userId, "5511999998888")).toEqual({ id: "lead-novo" });
    expect(eq).toHaveBeenCalledWith("user_id", userId);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: userId, whatsapp: "5511999998888", status: "novo" }));
  });
  it("não cria contatos quando a IA está desligada", async () => {
    const { db, insert } = mockDb(false);
    expect(await criarLeadRecebidoIA(db, userId, "5511999998888")).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });
  it("rejeita identificador sem telefone válido antes de acessar dados", async () => {
    const { db, insert } = mockDb(true);
    await expect(criarLeadRecebidoIA(db, userId, "123@lid")).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});