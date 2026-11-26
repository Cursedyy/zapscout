import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { carregarRetornoCampanhas } from "./mimo-dashboard-retorno.server";

vi.mock("./mimo-comercial-v2.server", () => ({ capacidadeComercial: async () => false }));
const empresaId = "empresa";
const data = { inicio: "2026-11-01", fim: "2026-11-30", origem: "" as const, campanha: "" };
const linha = {
  id: "m1", empresa_id: empresaId, chave: "m1", campanha: "Teste", conjunto: "", anuncio: "",
  data_inicio: data.inicio, data_fim: data.inicio, investimento: 10, leads_meta: 2,
};
const dataHora = data.inicio + "T12:00:00Z";
const ids = { campanha_id: "11", conjunto_id: "22", anuncio_id: "33" };

function consultar(erro: { code: string; message: string } | null) {
  const projecoes: string[] = [];
  const db = createClient<Database>("https://banco.example.test", "chave-de-teste", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      const tabela = url.pathname.split("/").at(-1);
      expect(url.searchParams.get("empresa_id")).toBe("eq." + empresaId);
      let linhas: unknown[] = [];
      if (tabela === "mimo_meta_ads_metricas") {
        const colunas = url.searchParams.get("select")!;
        projecoes.push(colunas);
        if (erro && colunas.includes("anuncio_id"))
          return Response.json(erro, { status: erro.code === "42501" ? 403 : 400 });
        linhas = [colunas.includes("anuncio_id") ? { ...linha, ...ids } : linha];
      } else if (tabela === "mimo_leads") {
        linhas = [{ id: "lead", empresa_id: empresaId, entrada_em: dataHora }];
      } else if (tabela === "mimo_whatsapp_eventos") {
        linhas = [{ id: "evento", empresa_id: empresaId, lead_id: "lead", direcao: "recebida",
          contato_em: dataHora, referencia_anuncio: { fonte: "metadado_whatsapp", id: ids.anuncio_id } }];
      }
      return Response.json(linhas, { headers: { "content-range": "0-0/" + linhas.length } });
    } },
  });
  const resultado = carregarRetornoCampanhas(db, db, { empresaId, papel: "administrador" }, data,
    data.inicio + "T00:00:00Z", data.fim + "T23:59:59Z");
  return { resultado, projecoes };
}

it.each(["42703", "PGRST204"])("lê o esquema antigo quando a coluna Meta falta (%s)", async code => {
  const { resultado, projecoes } = consultar({ code, message: "column mimo_meta_ads_metricas.campanha_id does not exist" });
  const r = await resultado;
  expect(projecoes).toHaveLength(2);
  expect(projecoes[1]).not.toMatch(/(?:campanha|conjunto|anuncio)_id/);
  expect(r.campanhas[0]).toMatchObject({ investimento: 1000, leadsMeta: 2, leadsCrm: null, roas: null });
  expect(r.naoAtribuidos.leads).toBe(1);
});

it("preserva a atribuição verificada no esquema com IDs", async () => {
  const { resultado, projecoes } = consultar(null);
  const r = await resultado;
  expect(projecoes).toHaveLength(1);
  expect(r.campanhas[0]).toMatchObject({ campanhaId: ids.campanha_id, leadsCrm: 1 });
  expect(r.naoAtribuidos.leads).toBe(0);
});

it.each([
  { code: "42501", message: "permission denied" },
  { code: "42703", message: "column investimento does not exist" },
])("preserva falhas reais sem trocar a projeção", async erro => {
  const { resultado, projecoes } = consultar(erro);
  await expect(resultado).rejects.toThrow("Não foi possível consultar");
  expect(projecoes).toHaveLength(1);
});

it("pagina o esquema antigo com o mesmo filtro e sem repetir a tentativa com IDs", async () => {
  const total = 1500;
  const projecoes: string[] = [];
  const db = createClient<Database>("https://banco.example.test", "chave-de-teste", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const tabela = url.pathname.split("/").at(-1);
      expect(url.searchParams.get("empresa_id")).toBe("eq." + empresaId);
      if (tabela !== "mimo_meta_ads_metricas")
        return Response.json([], { headers: { "content-range": "*/0" } });
      const colunas = url.searchParams.get("select")!;
      projecoes.push(colunas);
      if (colunas.includes("anuncio_id"))
        return Response.json({ code: "42703", message: "column mimo_meta_ads_metricas.anuncio_id does not exist" }, { status: 400 });
      const faixa = new Headers(init?.headers).get("range") ?? url.searchParams.get("offset");
      const [de] = String(faixa ?? "0-999").split("-").map(Number);
      const inicio = de ?? 0;
      const linhas = Array.from({ length: Math.min(1000, total - inicio) }, (_, i) =>
        ({ ...linha, id: "m" + (inicio + i), chave: "m" + (inicio + i), anuncio: "a" + (inicio + i) }));
      return Response.json(linhas, { headers: { "content-range": `${inicio}-${inicio + linhas.length - 1}/${total}` } });
    } },
  });
  const r = await carregarRetornoCampanhas(db, db, { empresaId, papel: "administrador" }, data,
    data.inicio + "T00:00:00Z", data.fim + "T23:59:59Z");
  expect(projecoes.filter(p => p.includes("anuncio_id"))).toHaveLength(1);
  expect(projecoes.filter(p => !p.includes("anuncio_id"))).toHaveLength(2);
  expect(r.campanhas[0]).toMatchObject({ investimento: 1000 * total, leadsMeta: 2 * total, leadsCrm: null });
});
