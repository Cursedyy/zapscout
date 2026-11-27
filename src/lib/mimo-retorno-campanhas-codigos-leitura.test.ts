import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { carregarRetornoCampanhas } from "./mimo-dashboard-retorno.server";

vi.mock("./mimo-comercial-v2.server", () => ({ capacidadeComercial: async () => false }));
const empresaId = "empresa";
const data = { inicio: "2026-11-01", fim: "2026-11-30", origem: "" as const, campanha: "" };
const dataHora = "2026-11-02T12:00:00Z";
const metaLinha = {
  id: "m1",
  empresa_id: empresaId,
  chave: "m1",
  campanha: "Teste",
  conjunto: "",
  anuncio: "",
  data_inicio: "2026-11-02",
  data_fim: "2026-11-02",
  investimento: 10,
  leads_meta: 2,
  campanha_id: "11",
  conjunto_id: "22",
  anuncio_id: "33",
};

function banco(migrado: boolean) {
  const urls: URL[] = [];
  const db = createClient<Database>("https://banco.example.test", "chave-de-teste", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        urls.push(url);
        const tabela = url.pathname.split("/").at(-1)!;
        expect(url.searchParams.get("empresa_id")).toBe("eq." + empresaId);
        const select = url.searchParams.get("select") ?? "";
        let linhas: unknown[] = [];
        if (tabela.startsWith("mimo_campanhas_codigos")) {
          if (!migrado)
            return Response.json(
              { code: "PGRST205", message: `Could not find the table 'public.${tabela}'` },
              { status: 404 },
            );
          if (tabela === "mimo_campanhas_codigos")
            linhas = [
              {
                id: "k1",
                empresa_id: empresaId,
                codigo: "BF26",
                nome: "Black Friday",
                ativo: true,
              },
            ];
          else if (tabela === "mimo_campanhas_codigos_meta")
            linhas = [{ empresa_id: empresaId, codigo_id: "k1", campanha_id: "11" }];
          else
            linhas = [
              {
                id: "i1",
                empresa_id: empresaId,
                codigo_id: "k1",
                competencia: "2026-11-03",
                valor_centavos: "2500",
                anulado_em: null,
              },
            ];
        } else if (tabela === "mimo_leads") {
          if (select.includes("campanha_codigo_id") && !migrado)
            return Response.json(
              { code: "42703", message: "column mimo_leads.campanha_codigo_id does not exist" },
              { status: 400 },
            );
          linhas = [
            {
              id: "lead",
              empresa_id: empresaId,
              entrada_em: dataHora,
              ...(migrado
                ? { campanha_codigo_id: "k1", campanha_codigo_origem: "anuncio_meta" }
                : {}),
            },
          ];
        } else if (tabela === "mimo_meta_ads_metricas") {
          linhas = [metaLinha];
        }
        return Response.json(linhas, {
          headers: { "content-range": `0-${Math.max(linhas.length - 1, 0)}/${linhas.length}` },
        });
      },
    },
  });
  return { db, urls };
}
const carregar = (db: ReturnType<typeof banco>["db"], papel = "administrador") =>
  carregarRetornoCampanhas(
    db,
    db,
    { empresaId, papel },
    data,
    data.inicio + "T03:00:00Z",
    "2026-12-01T02:59:59Z",
  );

it("antes da migração: seção de códigos ausente, coorte e retorno Meta preservados", async () => {
  const { db } = banco(false);
  const r = await carregar(db);
  expect(r.porCodigo).toBeNull();
  expect(r.campanhas[0]).toMatchObject({ investimento: 1000, leadsMeta: 2 });
  expect(r.naoAtribuidos.leads).toBe(1);
});

it("com a migração: soma Meta vinculado + manual e atribui o lead pelo código gravado", async () => {
  const { db, urls } = banco(true);
  const r = await carregar(db);
  expect(r.porCodigo!.codigos[0]).toMatchObject({
    codigo: "BF26",
    investimentoMeta: 1000,
    investimentoManual: 2500,
    investimento: 3500,
    leadsCrm: 1,
    leadsAutomaticos: 1,
    pedidos: null,
    receita: null,
  });
  const inv = urls.find((u) => u.pathname.endsWith("/mimo_campanhas_codigos_investimentos"))!;
  expect(inv.searchParams.get("anulado_em")).toBe("is.null");
  expect(inv.searchParams.getAll("competencia")).toEqual(["gte.2026-11-01", "lte.2026-11-30"]);
});

it("marketing recebe agregados por código sem pedidos (indisponível, não zero)", async () => {
  const { db, urls } = banco(true);
  const r = await carregar(db, "marketing");
  expect(r.porCodigo!.codigos[0]).toMatchObject({
    leadsCrm: 1,
    pedidos: null,
    receita: null,
    cac: null,
    roas: null,
  });
  expect(urls.some((u) => u.pathname.endsWith("/mimo_pedidos_conversao"))).toBe(false);
});
