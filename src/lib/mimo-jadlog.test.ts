import { describe, it, expect, vi } from "vitest";
import { CATALOGO, itemDeProduto, novoPedido, pedidoSchema, sugerirCaixas, type Pedido } from "./mimo-pedido";
import { configJadlogSchema, cotarJadlog, montarFreteJadlog, validarComprovantesJadlog } from "./mimo-jadlog.server";

const cfg = configJadlogSchema.parse({ token: "token-sintetico-nao-real", cnpj: "11222333000181", servicos: [{ codigo: 3, nome: "Package", divisorCubagem: 3333 }] });
const agora = Date.parse("2026-11-03T15:00:00Z");
function pedido(): Pedido {
  const itens = [itemDeProduto(CATALOGO.find(p => p.preco !== null && p.pesoG !== null)!)];
  return { ...novoPedido(), leadId: "11111111-1111-4111-8111-111111111111", itens, volumes: sugerirCaixas(itens).map(v => ({ ...v, confirmado: true })), destinoCep: "01001000", endereco: "Endereço sintético", declarado: 10000, fretePagador: "cliente" };
}
function enviar(body: unknown) { return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })); }
describe("cotação Jadlog no servidor", () => {
  it("envia o maior peso entre real e cubado, reais na API e o contrato do servidor", async () => {
    const p = pedido(); const f = enviar({ frete: [{ modalidade: 3, vltotal: 27.45, prazo: 5 }] });
    const [c] = await cotarJadlog(p, cfg, "empresa", "ator", f, agora);
    expect(c.valor).toBe(2745); expect(c.prazo).toBe("5 dias úteis");
    const [url, init] = f.mock.calls[0]; expect(url).toBe("https://www.jadlog.com.br/embarcador/api/frete/valor");
    const body = JSON.parse(init!.body as string).frete[0];
    expect(body.vldeclarado).toBe(100); expect(body.peso).toBeGreaterThan(0); expect(body.cnpj).toBe(cfg.cnpj);
    // Cliente pagar no pedido não autoriza cobrança da transportadora no destino.
    expect(body.frap).toBe("N"); expect(init!.redirect).toBe("error");
    expect(body).not.toHaveProperty("vlcoleta");
    const p2 = pedidoSchema.parse({ ...p, cotacoes: [c], cotacaoId: c.id });
    expect(() => validarComprovantesJadlog(p2, null, "empresa", "ator", cfg, agora)).not.toThrow();
    expect(JSON.stringify(c)).not.toContain(cfg.token);
  });
  it("aplica o fator contratado por serviço e nunca ignora a cubagem", () => {
    const p = pedido(); p.volumes[0].pesoAjustadoG = 1;
    const a = montarFreteJadlog(p, cfg).frete[0].peso;
    const b = montarFreteJadlog(p, { ...cfg, servicos: [{ ...cfg.servicos[0], divisorCubagem: 6000 }] }).frete[0].peso;
    expect(a).toBeGreaterThan(b); expect(b).toBeGreaterThan(0.001);
  });
  it("bloqueia valor adulterado, outra empresa, ator, cliente e expiração", async () => {
    const p = pedido(); p.cotacoes = await cotarJadlog(p, cfg, "empresa", "ator", enviar({ frete: [{ modalidade: 3, vltotal: 30, prazo: 3 }] }), agora);
    p.cotacaoId = p.cotacoes[0].id;
    expect(() => validarComprovantesJadlog({ ...p, cotacoes: p.cotacoes.map(c => ({ ...c, valor: 1 })) }, null, "empresa", "ator", cfg, agora)).toThrow(/alterada/);
    expect(() => validarComprovantesJadlog(p, null, "outra", "ator", cfg, agora)).toThrow();
    expect(() => validarComprovantesJadlog(p, null, "empresa", "outro", cfg, agora)).toThrow();
    expect(() => validarComprovantesJadlog({ ...p, leadId: "22222222-2222-4222-8222-222222222222" }, null, "empresa", "ator", cfg, agora)).toThrow();
    expect(() => validarComprovantesJadlog(p, null, "empresa", "ator", cfg, agora + 16 * 60_000)).toThrow(/expirou/);
    expect(() => validarComprovantesJadlog(p, p, "empresa", "ator", null, agora + 16 * 60_000)).not.toThrow();
    expect(() => validarComprovantesJadlog({ ...p, cotacaoId: null }, null, "empresa", "ator", cfg, agora + 16 * 60_000)).not.toThrow();
  });
  it("não consulta remessa sem caixas conferidas ou sem peso", async () => {
    const p = pedido(); const f = enviar({}); p.volumes[0].confirmado = false;
    await expect(cotarJadlog(p, cfg, "empresa", "ator", f, agora)).rejects.toThrow(/Confira/); expect(f).not.toHaveBeenCalled();
    p.volumes[0].confirmado = true; p.itens[0].pesoG = null;
    await expect(cotarJadlog(p, cfg, "empresa", "ator", f, agora)).rejects.toThrow(/peso/);
  });
  it.each([{ error: { descricao: "Contrato inválido" } }, { frete: [{ modalidade: 3, erro: { id: 1 } }] }, { frete: [{ modalidade: 3, vltotal: -1 }] }, { frete: [{ modalidade: 999, vltotal: 10 }] }])("não transforma erros em frete grátis", async body => {
    await expect(cotarJadlog(pedido(), cfg, "empresa", "ator", enviar(body), agora)).rejects.toThrow();
  });
  it("não inventa um prazo quando o serviço não o retorna", async () => {
    const [c] = await cotarJadlog(pedido(), cfg, "empresa", "ator", enviar({ frete: [{ modalidade: 3, vltotal: 30 }] }), agora);
    expect(c.prazo).toBe("Prazo a confirmar");
  });
});
