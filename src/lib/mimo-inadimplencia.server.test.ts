import { describe, expect, it, vi } from "vitest";
import {
  CHAMADAS_PERMITIDAS,
  LIMITES_INADIMPLENCIA,
  consultarInadimplenciaOmie,
  listarContasReceberOmie,
} from "./mimo-inadimplencia.server";
import { AGORA_FIXTURE, PERIODO_FIXTURE, titulosSinteticos } from "./mimo-inadimplencia.fixtures";

// Credenciais fictícias; o fetch é sempre simulado e a API real nunca é chamada.
const cfg = {
  appKey: "chave-sintetica",
  secret: "segredo-sintetico",
  empresaId: "10000000-0000-4000-8000-000000000001",
  modo: "simulacao" as const,
};
const esperar = vi.fn(async () => {});
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

type Corpo = {
  call: string;
  app_key: string;
  app_secret: string;
  param: [Record<string, unknown>];
};
function omieSimulado(respostas: {
  paginas?: unknown[][];
  totalPaginas?: number;
  cliente?: (codigo: number) => Response;
  vendedores?: () => Response;
  contas?: (pagina: number) => Response | undefined;
}) {
  const chamadas: Array<{ url: string; corpo: Corpo }> = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body)) as Corpo;
    chamadas.push({ url: String(url), corpo });
    expect(init?.method).toBe("POST");
    if (String(url).endsWith("financas/contareceber/")) {
      const pagina = Number(corpo.param[0].pagina);
      const especial = respostas.contas?.(pagina);
      if (especial) return especial;
      const paginas = respostas.paginas ?? [];
      return json({
        pagina,
        total_de_paginas: respostas.totalPaginas ?? paginas.length,
        registros: paginas[pagina - 1]?.length ?? 0,
        total_de_registros: paginas.flat().length,
        conta_receber_cadastro: paginas[pagina - 1] ?? [],
      });
    }
    if (String(url).endsWith("geral/clientes/"))
      return (
        respostas.cliente?.(Number(corpo.param[0].codigo_cliente_omie)) ??
        json({ razao_social: `Cliente Sintético ${corpo.param[0].codigo_cliente_omie} Ltda` })
      );
    if (String(url).endsWith("geral/vendedores/"))
      return (
        respostas.vendedores?.() ??
        json({ total_de_paginas: 1, cadastro: [{ codigo: 5, nome: "Vendedora Sintética" }] })
      );
    throw Error(`URL inesperada ${String(url)}`);
  });
  return { fetcher: fetcher as unknown as typeof fetch, chamadas };
}

describe("consulta ao Omie (somente leitura)", () => {
  it("pagina, calcula e completa nomes usando apenas chamadas de consulta", async () => {
    const titulos = titulosSinteticos();
    const { fetcher, chamadas } = omieSimulado({
      paginas: [titulos.slice(0, 8), titulos.slice(8)],
    });
    const r = await consultarInadimplenciaOmie(cfg, PERIODO_FIXTURE, {
      fetcher,
      esperar,
      agora: AGORA_FIXTURE,
    });
    expect(r.hoje).toBe("2026-11-27");
    expect(r.titulosLidos).toBe(16);
    expect(r.indiceValor).toBe(73.83);
    expect(r.clientes[0]).toMatchObject({ cliente: 30, nome: "Cliente Sintético 30 Ltda" });
    expect(r.vendedores.find((v) => v.vendedor === 5)?.nome).toBe("Vendedora Sintética");
    expect(r.vendedores.find((v) => v.vendedor === 6)?.nome).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/1 título\(s\) sem campos obrigatórios/);
    expect(r.avisos.join(" ")).toMatch(/PARCIAL/);
    const permitidas = Object.values(CHAMADAS_PERMITIDAS).flat() as string[];
    for (const { url, corpo } of chamadas) {
      expect(url.startsWith("https://app.omie.com.br/api/v1/")).toBe(true);
      expect(permitidas).toContain(corpo.call);
      expect(corpo.call).not.toMatch(/Incluir|Alterar|Excluir|Lancar|Cancelar|Upsert|Baixar/i);
    }
    const contas = chamadas.filter((c) => c.corpo.call === "ListarContasReceber");
    expect(contas.map((c) => c.corpo.param[0].pagina)).toEqual([1, 2]);
    expect(contas[0].corpo.param[0].registros_por_pagina).toBe(500);
    expect(chamadas.filter((c) => c.corpo.call === "ConsultarCliente")).toHaveLength(4);
  });

  it("limita a quantidade de nomes de clientes consultados", async () => {
    const titulos = Array.from({ length: 20 }, (_, i) => ({
      codigo_lancamento_omie: i + 1,
      codigo_cliente_fornecedor: i + 1,
      data_vencimento: "01/11/2026",
      valor_documento: i + 1,
      status_titulo: "ATRASADO",
    }));
    const { fetcher, chamadas } = omieSimulado({ paginas: [titulos] });
    await consultarInadimplenciaOmie(cfg, PERIODO_FIXTURE, {
      fetcher,
      esperar,
      agora: AGORA_FIXTURE,
    });
    expect(chamadas.filter((c) => c.corpo.call === "ConsultarCliente")).toHaveLength(
      LIMITES_INADIMPLENCIA.maxNomesClientes,
    );
    expect(chamadas.some((c) => c.corpo.call === "ListarVendedores")).toBe(false);
  });

  it("recusa bases acima do limite sem calcular nada", async () => {
    const { fetcher, chamadas } = omieSimulado({ paginas: [[]], totalPaginas: 21 });
    await expect(listarContasReceberOmie(cfg, { fetcher, esperar })).rejects.toThrow(
      /acima do limite de 10\.000/,
    );
    expect(chamadas).toHaveLength(1);
  });

  it("trata 'não existem registros' na primeira página como lista vazia", async () => {
    const { fetcher } = omieSimulado({
      contas: () =>
        json(
          {
            faultstring: "ERROR: Não existem registros para a página [1]!",
            faultcode: "SOAP-ENV:Client-5113",
          },
          500,
        ),
    });
    const r = await consultarInadimplenciaOmie(cfg, PERIODO_FIXTURE, {
      fetcher,
      esperar,
      agora: AGORA_FIXTURE,
    });
    expect(r.titulosLidos).toBe(0);
    expect(r.indiceValor).toBeNull();
  });

  it("interrompe quando a paginação muda durante a leitura", async () => {
    const { fetcher } = omieSimulado({
      paginas: [titulosSinteticos().slice(0, 3), titulosSinteticos().slice(3, 6)],
      contas: (p) =>
        p === 2 ? json({ total_de_paginas: 3, conta_receber_cadastro: [] }) : undefined,
    });
    await expect(listarContasReceberOmie(cfg, { fetcher, esperar })).rejects.toThrow(/mudou/);
  });

  it.each([
    [
      json(
        { faultstring: "ERROR: Consumo redundante detectado", faultcode: "SOAP-ENV:Client-6" },
        500,
      ),
      /limitou as consultas/,
    ],
    [json({}, 429), /limitou as consultas/],
    [
      json(
        {
          faultstring: "ERROR: A chave de acesso não está preenchida ou não é válida (app_key)",
          faultcode: "SOAP-ENV:Client-101",
        },
        500,
      ),
      /recusou as credenciais/,
    ],
    [
      json({ faultstring: "Erro interno", faultcode: "SOAP-ENV:Server" }, 500),
      /recusou a consulta \(ListarContasReceber, HTTP 500\)/,
    ],
    [new Response("<html>", { status: 200 }), /recusou a consulta/],
    [json({ conta_receber_cadastro: "x", total_de_paginas: "1" }), /formato inesperado/],
    [
      new Response(null, { status: 302, headers: { location: "https://exemplo.invalid" } }),
      /redirecionou/,
    ],
  ])("mapeia falhas do Omie para mensagens seguras (%#)", async (resposta, mensagem) => {
    const { fetcher } = omieSimulado({ contas: () => resposta });
    const erro = await listarContasReceberOmie(cfg, { fetcher, esperar }).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(mensagem);
    expect((erro as Error).message).not.toContain(cfg.secret);
    expect((erro as Error).message).not.toContain(cfg.appKey);
  });

  it("falha de rede vira mensagem genérica", async () => {
    const fetcher = vi.fn(async () => {
      throw Error("getaddrinfo ENOTFOUND segredo-sintetico");
    }) as unknown as typeof fetch;
    await expect(listarContasReceberOmie(cfg, { fetcher, esperar })).rejects.toThrow(
      /^Não foi possível conectar ao Omie \(OMIE-REDE\)/,
    );
  });

  it("recusa respostas sem nenhum título válido em vez de mostrar zero", async () => {
    const { fetcher } = omieSimulado({ paginas: [[{ codigo_lancamento_omie: 1 }]] });
    await expect(
      consultarInadimplenciaOmie(cfg, PERIODO_FIXTURE, { fetcher, esperar, agora: AGORA_FIXTURE }),
    ).rejects.toThrow(/sem os campos necessários/);
  });

  it("nomes são complementares: falhas viram aviso e não alteram valores", async () => {
    const { fetcher } = omieSimulado({
      paginas: [titulosSinteticos()],
      cliente: () => json({ faultstring: "Consumo indevido", faultcode: "x" }, 500),
      vendedores: () => json({ faultstring: "Erro", faultcode: "x" }, 500),
    });
    const r = await consultarInadimplenciaOmie(cfg, PERIODO_FIXTURE, {
      fetcher,
      esperar,
      agora: AGORA_FIXTURE,
    });
    expect(r.indiceValor).toBe(73.83);
    expect(r.clientes.every((c) => c.nome === null)).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/nomes de clientes/);
    expect(r.avisos.join(" ")).toMatch(/nomes dos vendedores/);
  });
});
