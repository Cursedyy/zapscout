import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  assinaturaFrete,
  avaliarVolume,
  calcularPedido,
  caixaDoVolume,
  conferirDistribuicao,
  cotacaoSchema,
  type Cotacao,
  type Pedido,
} from "./mimo-pedido";

// Rotas anônimas usadas pela calculadora pública do Jadlog Entregas.
const BASE = "https://apigwjadlogentregas.azure-api.net/";
const TRANSPORTADORA = "2a83cae8-99f6-496e-8ff5-f358c2bc675e";
export type ConfigJadlog = { chaveAssinatura: string };
export function configJadlog(): ConfigJadlog | null {
  const chave = process.env.MIMO_JADLOG_SIGNING_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return chave
    ? {
        chaveAssinatura: createHmac("sha256", chave)
          .update("mimo:jadlog-entregas:quote:v1")
          .digest("hex"),
      }
    : null;
}
export function montarVolumesJadlogEntregas(p: Pedido) {
  if (
    !p.leadId ||
    !/^\d{8}$/.test(p.origemCep) ||
    !/^\d{8}$/.test(p.destinoCep) ||
    !p.endereco.trim()
  )
    throw Error("Informe o cliente, CEP e endereço de entrega.");
  if (!p.itens.length || !p.volumes.length || !conferirDistribuicao(p.itens, p.volumes))
    throw Error("Confira a distribuição dos produtos nas caixas.");
  calcularPedido(p);
  if (p.declarado <= 0) throw Error("Confira o valor da mercadoria antes de calcular o frete.");
  const bases = p.volumes.map((v) =>
    v.conteudo.reduce((s, c) => {
      const i = p.itens.find((i) => i.id === c.itemId)!;
      return s + BigInt(i.brinde ? i.precoOriginal : i.precoNegociado) * BigInt(c.quantidade);
    }, 0n),
  );
  const soma = bases.reduce((a, b) => a + b, 0n);
  if (!soma)
    throw Error(
      "Informe o valor dos produtos para distribuir o valor da mercadoria entre as caixas.",
    );
  const valores = bases.map((b) => Number((BigInt(p.declarado) * b) / soma));
  let resto = p.declarado - valores.reduce((a, b) => a + b, 0);
  const ordem = bases
    .map((b, i) => ({ i, r: (BigInt(p.declarado) * b) % soma }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of ordem) {
    if (!resto) break;
    valores[i]++;
    resto--;
  }
  return p.volumes.map((v, i) => {
    const a = avaliarVolume(v, p.itens);
    if (!v.confirmado || !v.conteudo.length || a.pesoCotacaoG === null || a.pesoCotacaoG <= 0)
      throw Error("Confira as caixas e informe o peso dos volumes pendentes.");
    if (valores[i] <= 0 || valores[i] > 3_000_000)
      throw Error(
        "Confira o valor da mercadoria de cada caixa: o simulador permite até R$ 30.000 por volume.",
      );
    const [comprimento, largura, altura] = caixaDoVolume(v).dimensoes;
    return {
      id: v.id,
      objeto: {
        Formato: "1",
        Remetente: p.origemCep,
        Destino: p.destinoCep,
        Peso: (a.pesoCotacaoG / 1000).toFixed(3),
        ValorSegurado: (valores[i] / 100).toFixed(2),
        Altura: String(altura),
        Largura: String(largura),
        Comprimento: String(comprimento),
        UsuarioRemetenteDestinatario: "Remetente",
      },
    };
  });
}
const linhaSchema = z.object({
  Modalidade: z.object({
    Codigo: z.string().min(1).max(20),
    Nome: z.string().trim().min(1).max(80),
  }),
  PrecoComDesconto: z.number().finite().nonnegative().max(1_000_000),
  PrazoMaximo: z.number().int().min(0).max(365).nullable().optional(),
  PrazoMinimo: z.number().int().min(0).max(365).nullable().optional(),
  CodErro: z.union([z.string(), z.number()]).nullable().optional(),
  Erro: z.unknown().optional(),
  ErroInterno: z.unknown().optional(),
});
type Linha = z.infer<typeof linhaSchema>;
const cache = new Map<string, { ate: number; dados: unknown }>();
function mac(
  c: Cotacao,
  expira: string,
  empresa: string,
  ator: string,
  chave: string,
  leadId: string | null,
) {
  const cotacao = [
    c.id,
    c.modalidade,
    c.prazo,
    c.modo,
    c.valor,
    Object.entries(c.valoresVolumes).sort(([a], [b]) => a.localeCompare(b)),
    c.assinatura,
    c.registradaEm,
    c.oficial,
    c.provedor,
  ];
  return createHmac("sha256", chave)
    .update(
      JSON.stringify({ versao: "mimo-jadlog-entregas-1", empresa, ator, leadId, expira, cotacao }),
    )
    .digest("hex");
}
export function validarComprovantesJadlog(
  p: Pedido,
  anterior: Pedido | null,
  empresa: string,
  ator: string,
  cfg: ConfigJadlog | null,
  agora = Date.now(),
) {
  for (const c of p.cotacoes) {
    if (
      c.provedor !== "jadlog" ||
      anterior?.cotacoes.some((old) => JSON.stringify(old) === JSON.stringify(c))
    )
      continue;
    const [expira, assinatura] = (c.comprovante ?? "").split(".");
    if (
      !cfg ||
      !/^\d+$/.test(expira ?? "") ||
      !/^[a-f0-9]{64}$/.test(assinatura ?? "") ||
      (c.id === p.cotacaoId && Number(expira) < agora) ||
      Number(expira) > agora + 16 * 60_000
    )
      throw Error("A cotação Jadlog Entregas expirou ou não é válida. Calcule o frete novamente.");
    if (
      !timingSafeEqual(
        Buffer.from(mac(c, expira, empresa, ator, cfg.chaveAssinatura, p.leadId), "hex"),
        Buffer.from(assinatura, "hex"),
      )
    )
      throw Error("A cotação Jadlog Entregas foi alterada. Calcule o frete novamente.");
  }
}
export async function cotarJadlog(
  p: Pedido,
  cfg: ConfigJadlog,
  empresa: string,
  ator: string,
  enviar: typeof fetch = fetch,
  agora = Date.now(),
): Promise<Cotacao[]> {
  const volumes = montarVolumesJadlogEntregas(p);
  const controller = new AbortController();
  const sinal = AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]);
  async function consultar(path: string, body?: unknown): Promise<unknown> {
    const key = `${empresa}:${path}:${body ? JSON.stringify(body) : ""}`;
    const salvo = enviar === fetch ? cache.get(key) : undefined;
    if (salvo && salvo.ate > agora) return salvo.dados;
    let r: Response;
    try {
      r = await enviar(BASE + path, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: sinal,
        redirect: "error",
      });
    } catch {
      throw Error("Não foi possível consultar o Jadlog Entregas. Tente novamente.");
    }
    if (!r.ok)
      throw Error(
        "O simulador Jadlog Entregas está indisponível. Tente novamente ou registre a cotação do site.",
      );
    let dados: unknown;
    try {
      dados = await r.json();
    } catch {
      throw Error("O Jadlog Entregas retornou uma resposta inválida.");
    }
    if (enviar === fetch) {
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(key, { dados, ate: agora + (body ? 60_000 : 5 * 60_000) });
    }
    return dados;
  }
  const [parametros, prazo] = await Promise.all([
    consultar("api/DescontoParamentro/BuscaTodos"),
    consultar(`api/JadLogPrazoCidaten/BuscaPorCep?cep=${p.destinoCep}`),
  ]);
  if (!Array.isArray(parametros) || !prazo || typeof prazo !== "object" || Array.isArray(prazo))
    throw Error("Não foi possível obter os parâmetros públicos do Jadlog Entregas.");
  const descontos = parametros.filter(
    (x) =>
      typeof x === "object" &&
      x &&
      (x as Record<string, unknown>).TransportadoraId === TRANSPORTADORA,
  );
  if (!descontos.length) throw Error("Tabela pública do Jadlog Entregas indisponível.");
  const unicos = new Map<string, (typeof volumes)[number]>();
  for (const v of volumes) unicos.set(JSON.stringify(v.objeto), v);
  const fila = [...unicos.entries()];
  const resultados = new Map<string, Linha[]>();
  let indice = 0;
  async function worker() {
    while (indice < fila.length) {
      const [key, v] = fila[indice++];
      const raw = await consultar("api/Calculadora/CalcularFrete", {
        CalcularObjeto: v.objeto,
        DescontoParametro: descontos,
        PrazoCidaten: prazo,
      });
      const parsed = z.array(linhaSchema).max(20).safeParse(raw);
      if (!parsed.success)
        throw Error("O Jadlog Entregas retornou uma cotação inválida. Confira os dados no site.");
      resultados.set(
        key,
        parsed.data.filter((r) => !r.CodErro && !r.Erro && !r.ErroInterno),
      );
    }
  }
  try {
    await Promise.all([worker(), worker()]);
  } catch (e) {
    controller.abort();
    throw e;
  }
  const porVolume = volumes.map((v) => ({
    id: v.id,
    linhas: resultados.get(JSON.stringify(v.objeto)) ?? [],
  }));
  const cotacoes: Cotacao[] = [];
  const codigos = new Set<string>();
  for (const primeira of porVolume[0].linhas) {
    if (codigos.has(primeira.Modalidade.Codigo)) continue;
    codigos.add(primeira.Modalidade.Codigo);
    const linhas = porVolume.map((v) =>
      v.linhas.find((r) => r.Modalidade.Codigo === primeira.Modalidade.Codigo),
    );
    if (linhas.some((r) => !r)) continue;
    const valoresVolumes = Object.fromEntries(
      porVolume.map((v, i) => [v.id, Math.round(linhas[i]!.PrecoComDesconto * 100)]),
    );
    const dias = linhas.map((r) => r!.PrazoMaximo);
    const maximo = dias.every((d) => d !== null && d !== undefined)
      ? Math.max(...(dias as number[]))
      : null;
    const c: Cotacao = {
      id: `jadlog-${crypto.randomUUID()}`,
      modalidade: `Jadlog Entregas ${primeira.Modalidade.Nome}`,
      prazo: maximo === null ? "Prazo a confirmar" : `Até ${maximo} dias úteis`,
      modo: "volumes",
      valor: Object.values(valoresVolumes).reduce((a, b) => a + b, 0),
      valoresVolumes,
      assinatura: assinaturaFrete(p),
      registradaEm: new Date(agora).toISOString(),
      oficial: true,
      provedor: "jadlog",
    };
    const expira = String(agora + 15 * 60_000);
    c.comprovante = `${expira}.${mac(c, expira, empresa, ator, cfg.chaveAssinatura, p.leadId)}`;
    cotacoes.push(cotacaoSchema.parse(c));
  }
  if (!cotacoes.length)
    throw Error("Nenhum serviço do Jadlog Entregas atende todos os volumes desta remessa.");
  return cotacoes.sort((a, b) => a.valor - b.valor).slice(0, 3);
}
