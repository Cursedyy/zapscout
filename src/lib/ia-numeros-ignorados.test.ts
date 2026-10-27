import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { numerosIgnoradosInput, numeroIgnoradoIA } from "./ia-numeros-ignorados";
import { contatoIgnoradoIA } from "./ia-numeros-ignorados.server";

describe("números que a IA não deve responder", () => {
  it("bloqueia o número informado com e sem DDI e nono dígito", () => {
    for (const numero of ["5511999998888", "11999998888", "551199998888"]) {
      expect(numeroIgnoradoIA(["+55 (11) 99999-8888"], numero)).toBe(true);
    }
  });
  it("permite outros números e números removidos da lista", () => {
    expect(numeroIgnoradoIA(["5511999998888"], "5511988887777")).toBe(false);
    expect(numeroIgnoradoIA([], "5511999998888")).toBe(false);
  });
  it("normaliza a entrada, elimina duplicatas e rejeita números inválidos", () => {
    expect(numerosIgnoradosInput.parse(["(11) 99999-8888", "5511999998888"])).toEqual(["5511999998888"]);
    expect(numerosIgnoradosInput.safeParse(["123"]).success).toBe(false);
  });
  it("consulta somente a lista do dono da instância", async () => {
    const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: { numeros_ignorados: ["5511999998888"] }, error: null }) }));
    const db = { from: () => ({ select: () => ({ eq }) }) } as unknown as SupabaseClient;
    expect(await contatoIgnoradoIA(db, "dono-instancia", "5511999998888")).toBe(true);
    expect(eq).toHaveBeenCalledWith("user_id", "dono-instancia");
  });
});