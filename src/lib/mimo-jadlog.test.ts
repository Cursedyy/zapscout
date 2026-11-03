import { describe, it, expect, vi } from "vitest";
import {
  CATALOGO,
  itemDeProduto,
  novoPedido,
  pedidoSchema,
  sugerirCaixas,
  type Pedido,
} from "./mimo-pedido";
import {
  cotarJadlog,
  montarVolumesJadlogEntregas,
  validarComprovantesJadlog,
} from "./mimo-jadlog.server";
const cfg = { chaveAssinatura: "chave-sintetica-nao-real" };
const agora = Date.parse("2026-11-03T15:00:00Z");
const parametros = [
  { TransportadoraId: "2a83cae8-99f6-496e-8ff5-f358c2bc675e", Desconto: 0, Modalidade: 4 },
];
function pedido(): Pedido {
  const itens = [itemDeProduto(CATALOGO.find((p) => p.preco !== null && p.pesoG !== null)!)];
  return {
    ...novoPedido(),
    leadId: "11111111-1111-4111-8111-111111111111",
    itens,
    volumes: sugerirCaixas(itens).map((v) => ({ ...v, confirmado: true })),
    destinoCep: "01001000",
    endereco: "Endereço sintético",
    declarado: 10000,
    fretePagador: "cliente",
  };
}
const linha = (codigo = "3", preco = 27.45) => ({
  Modalidade: { Codigo: codigo, Nome: codigo === "3" ? ".Package" : ".Com" },
  PrecoComDesconto: preco,
  PrazoMaximo: 5,
  PrazoMinimo: 3,
  CodErro: null,
});
function enviar(body: unknown = [linha()]) {
  return vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes("DescontoParamentro")
              ? parametros
              : String(url).includes("BuscaPorCep")
                ? { PrazoExpresso: 1, PrazoRodoviario: 2 }
                : body,
          ),
          { status: 200 },
        ),
    );
}
function duasCaixas(p: Pedido) {
  const i = p.itens[0];
  p.itens = [{ ...i, quantidade: 2 }];
  p.volumes = [1, 2].map(() => ({
    ...p.volumes[0],
    id: crypto.randomUUID(),
    conteudo: [{ itemId: i.id, quantidade: 1 }],
  }));
  return p;
}
describe("cotação pública Jadlog Entregas", () => {
  it("recusa preço adulterado no mapa de volumes, usado no total financeiro", async () => {
    const p = pedido();
    p.cotacoes = await cotarJadlog(p, cfg, "empresa", "ator", enviar(), agora);
    p.cotacaoId = p.cotacoes[0].id;
    p.cotacoes[0].valoresVolumes[p.volumes[0].id] = 1;
    expect(() => validarComprovantesJadlog(p, null, "empresa", "ator", cfg, agora)).toThrow(/alterada/);
  });
  it("não apresenta frete parcial se nenhum serviço atende todas as caixas", async () => {
    const p = duasCaixas(pedido()); p.declarado = 10001;
    const f = enviar(); let n = 0;
    f.mockImplementation(async (url, init) => new Response(JSON.stringify(init?.method === "POST" ? [linha(++n === 1 ? "3" : "9")] : String(url).includes("DescontoParamentro") ? parametros : { PrazoExpresso: 1 }), { status: 200 }));
    await expect(cotarJadlog(p, cfg, "empresa", "ator", f, agora)).rejects.toThrow(/todos os volumes/);
  });
  it("consulta o simulador público sem token de contrato e assina o resultado", async () => {
    const p = pedido(),
      f = enviar();
    const [c] = await cotarJadlog(p, cfg, "empresa", "ator", f, agora);
    expect(c.valor).toBe(2745);
    expect(c.prazo).toBe("Até 5 dias úteis");
    expect(c.valoresVolumes[p.volumes[0].id]).toBe(2745);
    const [url, init] = f.mock.calls.find(([, x]) => x?.method === "POST")!;
    expect(url).toBe("https://apigwjadlogentregas.azure-api.net/api/Calculadora/CalcularFrete");
    expect(init!.headers).not.toHaveProperty("Authorization");
    expect(init!.redirect).toBe("error");
    const body = JSON.parse(init!.body as string).CalcularObjeto;
    expect(body.ValorSegurado).toBe("100.00");
    expect(Number(body.Peso)).toBeGreaterThan(0);
    expect(body.Altura).toBeTruthy();
    expect(body.UsuarioRemetenteDestinatario).toBe("Remetente");
    expect(() =>
      validarComprovantesJadlog(
        pedidoSchema.parse({ ...p, cotacoes: [c], cotacaoId: c.id }),
        null,
        "empresa",
        "ator",
        cfg,
        agora,
      ),
    ).not.toThrow();
    expect(JSON.stringify(c)).not.toContain(cfg.chaveAssinatura);
  });
  it("rateia os centavos uma vez e soma o frete de todas as caixas", async () => {
    const p = duasCaixas(pedido());
    p.declarado = 10001;
    expect(montarVolumesJadlogEntregas(p).map((v) => v.objeto.ValorSegurado)).toEqual([
      "50.01",
      "50.00",
    ]);
    const [c] = await cotarJadlog(p, cfg, "empresa", "ator", enviar(), agora);
    expect(c.valor).toBe(5490);
    expect(Object.keys(c.valoresVolumes)).toHaveLength(2);
  });
  it("consulta caixas idênticas uma vez e mantém o valor de cada volume", async () => {
    const f = enviar();
    const [c] = await cotarJadlog(duasCaixas(pedido()), cfg, "empresa", "ator", f, agora);
    expect(f.mock.calls.filter(([, x]) => x?.method === "POST")).toHaveLength(1);
    expect(c.valor).toBe(5490);
  });
  it("bloqueia adulteração, troca de empresa/ator/cliente e expiração", async () => {
    const p = pedido();
    p.cotacoes = await cotarJadlog(p, cfg, "empresa", "ator", enviar(), agora);
    p.cotacaoId = p.cotacoes[0].id;
    expect(() =>
      validarComprovantesJadlog(
        { ...p, cotacoes: p.cotacoes.map((c) => ({ ...c, valor: 1 })) },
        null,
        "empresa",
        "ator",
        cfg,
        agora,
      ),
    ).toThrow(/alterada/);
    expect(() => validarComprovantesJadlog(p, null, "outra", "ator", cfg, agora)).toThrow();
    expect(() => validarComprovantesJadlog(p, null, "empresa", "outro", cfg, agora)).toThrow();
    expect(() =>
      validarComprovantesJadlog(
        { ...p, leadId: "22222222-2222-4222-8222-222222222222" },
        null,
        "empresa",
        "ator",
        cfg,
        agora,
      ),
    ).toThrow();
    expect(() =>
      validarComprovantesJadlog(p, null, "empresa", "ator", cfg, agora + 16 * 60_000),
    ).toThrow(/expirou/);
    expect(() =>
      validarComprovantesJadlog(p, p, "empresa", "ator", null, agora + 16 * 60_000),
    ).not.toThrow();
    expect(() =>
      validarComprovantesJadlog(
        { ...p, cotacaoId: null },
        null,
        "empresa",
        "ator",
        cfg,
        agora + 16 * 60_000,
      ),
    ).not.toThrow();
  });
  it("não consulta caixas sem conferência ou peso", async () => {
    const p = pedido(),
      f = enviar();
    p.volumes[0].confirmado = false;
    await expect(cotarJadlog(p, cfg, "empresa", "ator", f, agora)).rejects.toThrow(/Confira/);
    expect(f).not.toHaveBeenCalled();
    p.volumes[0].confirmado = true;
    p.itens[0].pesoG = null;
    await expect(cotarJadlog(p, cfg, "empresa", "ator", f, agora)).rejects.toThrow(/peso/);
  });
  it.each([{}, [linha("3", -1)], [{ ...linha(), CodErro: "-1", Erro: "Não atendido" }], []])(
    "não transforma erro em frete grátis",
    async (body) => {
      await expect(
        cotarJadlog(pedido(), cfg, "empresa", "ator", enviar(body), agora),
      ).rejects.toThrow();
    },
  );
  it("não inventa prazo e ordena os serviços pelo menor valor", async () => {
    const r = await cotarJadlog(
      pedido(),
      cfg,
      "empresa",
      "ator",
      enviar([{ ...linha("3", 30), PrazoMaximo: null }, linha("9", 20)]),
      agora,
    );
    expect(r[0].valor).toBe(2000);
    expect(r[1].prazo).toBe("Prazo a confirmar");
  });
});
