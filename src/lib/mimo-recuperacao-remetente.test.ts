import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
const f = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("./uazapi.server", () => ({ uazStatus: f.status }));
vi.mock("./mimo-whatsapp", () => ({
  hashTokenMimo: async () => "hash",
  numeroConectadoMimo: (v: string) => v?.replace(/\D/g, ""),
}));
import {
  remetentesRecuperacao,
  validarRemetenteRecuperacao,
  tokenRemetenteRecuperacao,
} from "./mimo-recuperacao-remetente.server";
const ia = { id: "ia", numero_comercial: "5511999990001", ativo: true };
const outra = {
  id: "outra",
  numero_comercial: "5511999990002",
  ativo: true,
  owner_id: "dono",
  token_sha256: "hash",
  instancia_id: "auxiliar",
};
function banco({ linhas = [ia, outra], agente = "ia", erro = false, owner = "dono" } = {}) {
  const filtros: unknown[][] = [];
  const db = {
    rpc: async (nome: string, p: { _empresa: string }) => {
      filtros.push([nome, "empresa_id", p._empresa]);
      return { data: agente, error: erro ? {} : null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          filtros.push([table, k, v]);
          return q;
        },
        maybeSingle: async () => ({
          error: erro ? {} : null,
          data:
            table === "mimo_agente_config"
              ? { vinculo_id: agente }
              : table === "mimo_recuperacao_config"
                ? { vinculo_id: "ia" }
                : table === "mimo_whatsapp_vinculos"
                  ? linhas.find((l) => l.id === filters.id)
                  : { token: "segredo", uazapi_instance_token: "segredo" },
        }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            error: erro ? {} : null,
            data:
              table === "mimo_whatsapp_vinculos"
                ? linhas
                : table === "profiles"
                  ? []
                  : [{ id: "auxiliar", user_id: owner }],
          }).then(resolve),
      };
      return q;
    },
  } as unknown as SupabaseClient<Database>;
  return { db, filtros };
}
beforeEach(() => {
  vi.clearAllMocks();
  f.status.mockResolvedValue({ status: "connected", profileNumber: outra.numero_comercial });
});
it("mostra somente números, sem credenciais, e bloqueia a linha da IA", async () => {
  const { db, filtros } = banco();
  const r = await remetentesRecuperacao(db, "empresa");
  expect(r).toEqual({
    selecionado: "ia",
    linhas: [
      { id: "ia", numero: ia.numero_comercial, permitido: false },
      { id: "outra", numero: outra.numero_comercial, permitido: true },
    ],
  });
  expect(JSON.stringify(r)).not.toContain("hash");
  expect(filtros.filter(([, k]) => k === "empresa_id")).toHaveLength(3);
});
it("bloqueia outro vínculo que represente o mesmo número normalizado da IA", async () => {
  const { db } = banco({ linhas: [ia, { ...outra, numero_comercial: "+55 (11) 99999-0001" }] });
  await expect(validarRemetenteRecuperacao(db, "empresa", "outra")).rejects.toThrow("diferente");
});
it("não admite vínculo desconhecido ou de outra empresa", async () => {
  await expect(validarRemetenteRecuperacao(banco().db, "empresa", "forjado")).rejects.toThrow(
    "diferente",
  );
});
it("worker recusa continuar usando remetente antigo após troca da seleção", async () => {
  await expect(validarRemetenteRecuperacao(banco().db, "empresa", "outra", true)).rejects.toThrow("mudou");
});
it("não admite uma linha de fechamento sem captura de respostas de novos contatos", async () => {
  const linhas = [ia, { ...outra, finalidade: "fechamento" }];
  await expect(
    validarRemetenteRecuperacao(banco({ linhas }).db, "empresa", "outra"),
  ).rejects.toThrow("diferente");
});
it("falha fechada se não consegue identificar o vínculo da IA", async () => {
  await expect(
    validarRemetenteRecuperacao(banco({ agente: "ausente" }).db, "empresa", "outra"),
  ).rejects.toThrow("diferente");
  await expect(
    validarRemetenteRecuperacao(banco({ erro: true }).db, "empresa", "outra"),
  ).rejects.toThrow("consultar");
});
it("resolve uma auxiliar somente pelo dono, hash e identidade ao vivo", async () => {
  expect(await tokenRemetenteRecuperacao(banco().db, "empresa", "outra")).toBe("segredo");
  expect(f.status).toHaveBeenCalledTimes(1);
});
it("recusa instância pertencente a outro dono", async () => {
  await expect(
    tokenRemetenteRecuperacao(banco({ owner: "outro" }).db, "empresa", "outra"),
  ).rejects.toThrow("identidade");
  expect(f.status).not.toHaveBeenCalled();
});
it("recusa troca de número e desconexão no provedor", async () => {
  f.status.mockResolvedValue({ status: "connected", profileNumber: ia.numero_comercial });
  await expect(tokenRemetenteRecuperacao(banco().db, "empresa", "outra")).rejects.toThrow(
    "conectado",
  );
  f.status.mockResolvedValue({ status: "disconnected", profileNumber: outra.numero_comercial });
  await expect(tokenRemetenteRecuperacao(banco().db, "empresa", "outra")).rejects.toThrow(
    "conectado",
  );
});
