import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { mensagensLeadWhatsAppMimo } from "./mimo-whatsapp.functions";

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = {
    middleware: () => builder,
    inputValidator: () => builder,
    handler: (fn: unknown) => fn,
  };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: async () => ({ empresaId: "empresa", papel: "gestor" }) }));

it("confere o lead e pagina as mensagens em uma única consulta autorizada", async () => {
  const mensagens = Array.from({ length: 31 }, (_, i) => ({ id: String(i), texto: String(i) }));
  const fetch = vi.fn(async () => Response.json([{ id: "lead", mensagens }]));
  const supabase = createClient("https://mimo.example.invalid", "chave-sintetica", { global: { fetch } });
  const ler = mensagensLeadWhatsAppMimo as unknown as (input: {
    context: { supabase: typeof supabase; userId: string };
    data: { leadId: string; pagina: number };
  }) => Promise<unknown>;
  expect(await ler({ context: { supabase, userId: "gestor" }, data: { leadId: "lead", pagina: 2 } }))
    .toEqual({ mensagens: mensagens.slice(0, 30), mais: true });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [request] = fetch.mock.calls[0] as unknown as [string];
  const url = new URL(request);
  expect(url.pathname).toBe("/rest/v1/mimo_leads");
  expect(url.searchParams.get("id")).toBe("eq.lead");
  expect(url.searchParams.get("empresa_id")).toBe("eq.empresa");
  expect(url.searchParams.get("mensagens.empresa_id")).toBe("eq.empresa");
  expect(url.searchParams.get("mensagens.order")).toBe("contato_em.desc,id.desc");
  expect(url.searchParams.get("mensagens.offset")).toBe("60");
  expect(url.searchParams.get("mensagens.limit")).toBe("31");
});
