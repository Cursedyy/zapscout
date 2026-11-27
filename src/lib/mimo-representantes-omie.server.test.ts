import { describe, expect, it, vi } from "vitest";
import { CHAMADAS_PERMITIDAS } from "./mimo-inadimplencia.server";
import {
  LIMITES_FATURAMENTO_OMIE,
  consultarFaturamentoOmie,
} from "./mimo-representantes-omie.server";
import {
  PERIODO_OMIE,
  R_SEC,
  R_SP,
  R_SUL,
  baseSintetica,
  clienteSintetico,
  notaSintetica,
} from "./mimo-representantes-omie.fixtures";

// Credenciais fictícias; o fetch é sempre simulado e a API real do Omie nunca é chamada.
const cfg = {
  appKey: "chave-sintetica",
  secret: "segredo-sintetico",
  empresaId: "10000000-0000-4000-8000-000000000001",
  modo: "simulacao" as const,
};
const esperar = vi.fn(async () => {});
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

type Corpo = { call: string; app_key: string; param: [Record<string, unknown>] };
function omieSimulado(r: {
  paginas?: unknown[][];
  totalPaginas?: number;
  totalRegistros?: number;
  notas?: (pagina: number) => Response | undefined;
  /** Resposta do lote ListarClientes; padrão: devolve os clientes pedidos que existem. */
  lote?: (codigos: number[]) => Response | undefined;
  clientes?: Record<number, ReturnType<typeof clienteSintetico>>;
  consultar?: (codigo: number) => Response | undefined;
}) {
  const chamadas: Array<{ url: string; corpo: Corpo }> = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body)) as Corpo;
    chamadas.push({ url: String(url), corpo });
    expect(init?.method).toBe("POST");
    const p = corpo.param[0];
    if (String(url).endsWith("produtos/nfconsultar/")) {
      const pagina = Number(p.pagina);
      const especial = r.notas?.(pagina);
      if (especial) return especial;
      const paginas = r.paginas ?? [];
      return json({
        pagina,
        total_de_paginas: r.totalPaginas ?? paginas.length,
        registros: paginas[pagina - 1]?.length ?? 0,
        total_de_registros: r.totalRegistros ?? paginas.flat().length,
        nfCadastro: paginas[pagina - 1] ?? [],
      });
    }
    if (String(url).endsWith("geral/clientes/") && corpo.call === "ListarClientes") {
      const codigos = (p.clientesPorCodigo as { codigo_cliente_omie: number }[]).map(
        (c) => c.codigo_cliente_omie,
      );
      const especial = r.lote?.(codigos);
      if (especial) return especial;
      const achados = codigos.map((c) => r.clientes?.[c]).filter(Boolean);
      return json({
        pagina: 1,
        total_de_paginas: 1,
        registros: achados.length,
        clientes_cadastro: achados,
      });
    }
    if (String(url).endsWith("geral/clientes/") && corpo.call === "ConsultarCliente") {
      const codigo = Number(p.codigo_cliente_omie);
      const especial = r.consultar?.(codigo);
      if (especial) return especial;
      const c = r.clientes?.[codigo];
      return c
        ? json(c)
        : json(
            { faultstring: "ERROR: Cliente não cadastrado", faultcode: "SOAP-ENV:Client-103" },
            500,
          );
    }
    throw Error(`URL inesperada ${String(url)}`);
  });
  return { fetcher: fetcher as unknown as typeof fetch, chamadas };
}

const CLIENTES = {
  10: clienteSintetico(10, "PR", "99.999.999/0001-99"),
  20: clienteSintetico(20, "SP", "11.222.333/0001-81"),
  30: clienteSintetico(30, "SP"),
};

describe("faturamento por representante pelo Omie (somente leitura)", () => {
  it("pagina ListarNF com filtros de saída/período e usa apenas chamadas de consulta", async () => {
    const { fetcher, chamadas } = omieSimulado({
      paginas: [
        [
          notaSintetica({ id: 1, cliente: 10, valor: 1000, doc: "99.999.999/0001-99" }),
          notaSintetica({ id: 2, cliente: 20, valor: 10, doc: "11.222.333/0001-81" }),
        ],
        [
          notaSintetica({ id: 3, cliente: 30, valor: 99.99 }),
          notaSintetica({ id: 4, cliente: 30, valor: 500, dCan: "20/11/2026" }),
        ],
      ],
      clientes: CLIENTES,
    });
    const r = await consultarFaturamentoOmie(cfg, PERIODO_OMIE, baseSintetica(), {
      fetcher,
      esperar,
      agora: new Date("2026-11-27T15:00:00Z"),
    });
    expect(r.notasLidas).toBe(4);
    expect(r.notasConsideradas).toBe(3);
    expect(r.excluidas.cancelada).toEqual({ quantidade: 1, valor: 50000 });
    expect(r.linhas.find((l) => l.representanteId === R_SUL)).toMatchObject({
      faturamento: 100000,
      comissao: 5000,
    });
    // CNPJ da nota casa com unidade manual → secundário, mesmo com UF SP no Omie.
    expect(r.linhas.find((l) => l.representanteId === R_SEC)?.faturamento).toBe(1000);
    expect(r.linhas.find((l) => l.representanteId === R_SP)?.faturamento).toBe(9999);
    expect(r.avisos).toEqual([]);
    expect(r.geradoEm).toBe("2026-11-27T15:00:00.000Z");

    const permitidas = Object.values(CHAMADAS_PERMITIDAS).flat() as string[];
    for (const { url, corpo } of chamadas) {
      expect(url.startsWith("https://app.omie.com.br/api/v1/")).toBe(true);
      expect(permitidas).toContain(corpo.call);
      expect(corpo.call).not.toMatch(/Incluir|Alterar|Excluir|Cancelar|Upsert|Associar|Lancar/i);
      expect(corpo.app_key).toBe("chave-sintetica");
    }
    const nf = chamadas.filter((c) => c.corpo.call === "ListarNF");
    expect(nf.map((c) => c.corpo.param[0].pagina)).toEqual([1, 2]);
    expect(nf[0].corpo.param[0]).toMatchObject({
      registros_por_pagina: 100,
      dEmiInicial: "01/11/2026",
      dEmiFinal: "27/11/2026",
      tpNF: "1",
      filtrar_por_status: "N",
      cApenasResumo: "S",
      apenas_importado_api: "N",
    });
    // Cliente 20 já casou pela atribuição manual: só 10 e 30 têm UF consultada, em um lote.
    const lotes = chamadas.filter((c) => c.corpo.call === "ListarClientes");
    expect(lotes).toHaveLength(1);
    expect(lotes[0].corpo.param[0].clientesPorCodigo).toEqual([
      { codigo_cliente_omie: 10 },
      { codigo_cliente_omie: 30 },
    ]);
    expect(chamadas.filter((c) => c.corpo.call === "ConsultarCliente")).toHaveLength(0);
    expect(esperar).toHaveBeenCalledWith(LIMITES_FATURAMENTO_OMIE.pausaMs);
  });

  it("sem notas no período devolve zeros sem consultar clientes", async () => {
    const { fetcher, chamadas } = omieSimulado({
      notas: () =>
        json(
          {
            faultstring: "ERROR: Não existem registros para a página [1]!",
            faultcode: "SOAP-ENV:Client-5113",
          },
          500,
        ),
    });
    const r = await consultarFaturamentoOmie(cfg, PERIODO_OMIE, baseSintetica(), {
      fetcher,
      esperar,
    });
    expect(r.total.faturamento).toBe(0);
    expect(r.total.clientes).toBe(3);
    expect(chamadas).toHaveLength(1);
  });

  it("recusa período acima do limite de notas sem calcular nada", async () => {
    const { fetcher, chamadas } = omieSimulado({
      paginas: [[notaSintetica({ id: 1, cliente: 10, valor: 1 })]],
      totalPaginas: LIMITES_FATURAMENTO_OMIE.maxPaginasNotas + 1,
      totalRegistros: 5_050,
    });
    await expect(
      consultarFaturamentoOmie(cfg, PERIODO_OMIE, baseSintetica(), { fetcher, esperar }),
    ).rejects.toThrow(/5\.050 notas fiscais.*acima do limite de 5\.000.*Reduza o período/);
    expect(chamadas).toHaveLength(1);
  });

  it("recusa lista que muda durante a leitura", async () => {
    const { fetcher } = omieSimulado({
      paginas: [[notaSintetica({ id: 1, cliente: 10, valor: 1 })], []],
      notas: (p) =>
        p === 2 ? json({ pagina: 2, total_de_paginas: 3, nfCadastro: [] }) : undefined,
    });
    await expect(
      consultarFaturamentoOmie(cfg, PERIODO_OMIE, baseSintetica(), { fetcher, esperar }),
    ).rejects.toThrow(/mudou durante a leitura/);
  });

  it("propaga credenciais recusadas sem inventar números", async () => {
    const { fetcher } = omieSimulado({
      notas: () =>
        json({ faultstring: "ERROR: app_key inválida", faultcode: "SOAP-ENV:Client-1" }, 500),
    });
    await expect(
      consultarFaturamentoOmie(cfg, PERIODO_OMIE, baseSintetica(), { fetcher, esperar }),
    ).rejects.toThrow(/recusou as credenciais/);
  });

  it("recusa resposta com notas sem os campos necessários", async () => {
    const { fetcher } = omieSimulado({ paginas: [[{ compl: { nIdNF: 1 } }]] });
    await expect(
      consultarFaturamentoOmie(cfg, PERIODO_OMIE, baseSintetica(), { fetcher, esperar }),
    ).rejects.toThrow(/sem os campos necessários/);
  });

  it("consulta individualmente quem o lote não devolveu e marca o resto como não consultado", async () => {
    const { fetcher, chamadas } = omieSimulado({
      paginas: [
        [
          notaSintetica({ id: 1, cliente: 10, valor: 100 }),
          notaSintetica({ id: 2, cliente: 30, valor: 200 }),
          notaSintetica({ id: 3, cliente: 77, valor: 300 }),
        ],
      ],
      clientes: CLIENTES,
      // Lote ignora o filtro e devolve só um cliente não pedido.
      lote: () =>
        json({ pagina: 1, total_de_paginas: 9, clientes_cadastro: [clienteSintetico(999, "AM")] }),
    });
    const r = await consultarFaturamentoOmie(cfg, PERIODO_OMIE, baseSintetica(), {
      fetcher,
      esperar,
    });
    const individuais = chamadas.filter((c) => c.corpo.call === "ConsultarCliente");
    expect(individuais.map((c) => c.corpo.param[0].codigo_cliente_omie)).toEqual([10, 30, 77]);
    expect(r.linhas.find((l) => l.representanteId === R_SUL)?.faturamento).toBe(10000);
    expect(r.linhas.find((l) => l.representanteId === R_SP)?.faturamento).toBe(20000);
    expect(r.semRepresentante.motivosNotas.cliente_nao_consultado).toEqual({
      notas: 1,
      faturamento: 30000,
    });
    expect(r.clientesOmie).toEqual({ consultados: 2, naoConsultados: 1 });
    expect(r.avisos.join(" ")).toMatch(/1 cliente\(s\) do Omie não puderam ser consultados/);
  });

  it("para de consultar clientes quando o Omie limita o consumo", async () => {
    const { fetcher, chamadas } = omieSimulado({
      paginas: [
        [
          notaSintetica({ id: 1, cliente: 10, valor: 100 }),
          notaSintetica({ id: 2, cliente: 30, valor: 200 }),
        ],
      ],
      lote: () => json({ faultstring: "Consumo redundante detectado" }, 500),
    });
    const r = await consultarFaturamentoOmie(cfg, PERIODO_OMIE, baseSintetica(), {
      fetcher,
      esperar,
    });
    expect(chamadas.filter((c) => c.corpo.call === "ConsultarCliente")).toHaveLength(0);
    expect(r.semRepresentante.faturamento).toBe(30000);
    expect(r.avisos.join(" ")).toMatch(/limite de consumo/);
  });

  it("interrompe sem valores quando passa do prazo total", async () => {
    let t = 0;
    const { fetcher } = omieSimulado({
      paginas: [[notaSintetica({ id: 1, cliente: 10, valor: 1 })], []],
    });
    await expect(
      consultarFaturamentoOmie(cfg, PERIODO_OMIE, baseSintetica(), {
        fetcher,
        esperar,
        relogio: () => (t += LIMITES_FATURAMENTO_OMIE.prazoTotalMs),
      }),
    ).rejects.toThrow(/tempo limite/);
  });

  it("valida o período antes de chamar o Omie", async () => {
    const { fetcher, chamadas } = omieSimulado({});
    await expect(
      consultarFaturamentoOmie(cfg, { de: "2026-12-01", ate: "2026-01-01" }, baseSintetica(), {
        fetcher,
        esperar,
      }),
    ).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });
});
