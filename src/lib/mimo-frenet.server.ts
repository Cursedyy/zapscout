import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { assinaturaFrete, cotacaoSchema, type Cotacao, type Pedido } from "./mimo-pedido";
import { prepararRemessaFrete } from "./mimo-frete-remessa";

// Fixed HTTPS endpoint: credentials are never accepted from the browser or sent on redirects.
const URL_COTACAO = "https://api.frenet.com.br/shipping/quote";
const postagemSchema = z.object({
  transportadoraCodigo: z.string().min(1).max(80),
  servicoCodigo: z.string().min(1).max(80),
  origemCep: z.string().regex(/^\d{8}$/),
  tipo: z.enum(["postagem", "coleta"]),
  descricao: z.string().trim().min(3).max(300),
});
export type ConfigFrenet = {
  token: string;
  chaveAssinatura: string;
  origemCep: string;
  postagens: z.infer<typeof postagemSchema>[];
};
export function configFrenet(): ConfigFrenet | null {
  const token = process.env.MIMO_FRENET_TOKEN?.trim();
  const chave = process.env.MIMO_FRENET_SIGNING_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origemCep = process.env.MIMO_FRENET_ORIGEM_CEP?.trim() || "96085440";
  if (!token || !chave || !/^\d{8}$/.test(origemCep) || /[\r\n]/.test(token)) return null;
  try {
    const postagens = z
      .array(postagemSchema)
      .max(100)
      .parse(JSON.parse(process.env.MIMO_FRENET_POSTAGENS || "[]"));
    return {
      token,
      origemCep,
      postagens,
      chaveAssinatura: createHmac("sha256", chave).update("mimo:frenet:v1").digest("hex"),
    };
  } catch {
    return null;
  }
}

export function montarConsultasFrenet(p: Pedido, cfg: ConfigFrenet) {
  if (p.origemCep !== cfg.origemCep)
    throw Error("O CEP de origem deve ser o da conta Frenet configurada para a MiMo.");
  return prepararRemessaFrete(p).map((v) => ({
    id: v.id,
    body: {
      SellerCEP: p.origemCep,
      RecipientCEP: p.destinoCep,
      RecipientCountry: "BR",
      ShipmentInvoiceValue: v.declaradoCentavos / 100,
      ShippingItemArray: [
        {
          Length: v.dimensoes[0],
          Width: v.dimensoes[1],
          Height: v.dimensoes[2],
          Weight: v.pesoG / 1000,
          Quantity: 1,
        },
      ],
    },
  }));
}

const linhaSchema = z.object({
  Error: z.boolean(),
  Carrier: z.string().trim().min(1).max(80),
  CarrierCode: z.string().trim().min(1).max(80),
  ServiceCode: z.string().trim().min(1).max(80),
  ServiceDescription: z.string().trim().min(1).max(100),
  ShippingPrice: z.union([z.string(), z.number()]),
  DeliveryTime: z.union([z.string(), z.number()]).nullish(),
});
type Linha = z.infer<typeof linhaSchema> & { centavos: number; dias?: number };
const cache = new Map<string, { ate: number; linhas: Linha[] }>();

function valorCentavos(valor: string | number) {
  const s = String(valor);
  if (!/^\d+(?:\.\d{1,8})?$/.test(s)) return null;
  const [inteiro, decimal = ""] = s.split(".");
  const n =
    Number(inteiro) * 100 +
    Number(decimal.padEnd(2, "0").slice(0, 2)) +
    (Number(decimal[2] || 0) >= 5 ? 1 : 0);
  return Number.isSafeInteger(n) && n <= 100_000_000 ? n : null;
}
function prazoDias(valor: string | number | null | undefined) {
  if (valor === null || valor === undefined || !/^\d+$/.test(String(valor))) return undefined;
  const n = Number(valor);
  return n <= 365 ? n : undefined;
}
function chaveServico(l: Linha) {
  return JSON.stringify([l.CarrierCode, l.ServiceCode]);
}
function assinaturaCotacao(
  c: Cotacao,
  expira: string,
  empresa: string,
  ator: string,
  leadId: string | null,
  chave: string,
) {
  const { comprovante: _, ...campos } = cotacaoSchema.parse(c);
  const dados = {
    ...campos,
    valoresVolumes: Object.entries(campos.valoresVolumes).sort(([a], [b]) => a.localeCompare(b)),
  };
  return createHmac("sha256", chave)
    .update(JSON.stringify({ versao: "mimo-frenet-1", empresa, ator, leadId, expira, dados }))
    .digest("hex");
}
export function validarComprovantesFrenet(
  p: Pedido,
  anterior: Pedido | null,
  empresa: string,
  ator: string,
  cfg: ConfigFrenet | null,
  agora = Date.now(),
) {
  for (const c of p.cotacoes) {
    if (c.provedor !== "frenet") continue;
    // Already persisted, byte-identical quotes remain immutable historical records.
    if (c.id === p.cotacaoId && !c.postagem)
      throw Error(
        "Confirme o ponto de postagem ou coleta em Pelotas antes de escolher esse frete.",
      );
    if (
      (c.id !== p.cotacaoId || anterior?.cotacaoId === c.id) &&
      anterior?.cotacoes.some((old) => JSON.stringify(old) === JSON.stringify(c))
    )
      continue;
    const [expira, mac] = (c.comprovante || "").split(".");
    if (
      !cfg ||
      !/^\d+$/.test(expira || "") ||
      !/^[a-f0-9]{64}$/.test(mac || "") ||
      Number(expira) > agora + 16 * 60_000 ||
      (c.id === p.cotacaoId && Number(expira) < agora)
    )
      throw Error("A cotação Frenet expirou ou não é válida. Calcule o frete novamente.");
    const esperado = assinaturaCotacao(c, expira, empresa, ator, p.leadId, cfg.chaveAssinatura);
    if (!timingSafeEqual(Buffer.from(esperado, "hex"), Buffer.from(mac, "hex")))
      throw Error("A cotação Frenet foi alterada. Calcule o frete novamente.");
  }
}

export async function cotarFrenet(
  p: Pedido,
  cfg: ConfigFrenet,
  empresa: string,
  ator: string,
  enviar: typeof fetch = fetch,
  agora = Date.now(),
) {
  const consultas = montarConsultasFrenet(p, cfg);
  // One request per physical package; never let an item-packing rule merge four real boxes.
  const unicas = new Map(consultas.map((v) => [JSON.stringify(v.body), v.body]));
  if (unicas.size > 30)
    throw Error(
      "A cotação automática permite até 30 composições diferentes de caixa por consulta.",
    );
  const fila = [...unicas.entries()];
  const resultados = new Map<string, Linha[]>();
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]);
  let indice = 0;
  const credencial = createHash("sha256").update(cfg.token).digest("hex");
  async function consultar() {
    while (indice < fila.length) {
      const [key] = fila[indice++];
      const cacheKey = `${empresa}:${credencial}:${key}`;
      const salvo = enviar === fetch ? cache.get(cacheKey) : undefined;
      if (salvo && salvo.ate > agora) {
        resultados.set(key, salvo.linhas);
        continue;
      }
      let r: Response;
      try {
        r = await enviar(URL_COTACAO, {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            token: cfg.token,
          },
          body: key,
          signal,
          redirect: "manual",
        });
      } catch {
        throw Error("Não foi possível consultar a Frenet. Tente novamente.");
      }
      // Workers supports manual redirects; never forward the token to a redirect destination.
      if (r.status >= 300 && r.status < 400)
        throw Error("A Frenet retornou um redirecionamento inesperado. Tente novamente.");
      if (r.status === 401 || r.status === 403)
        throw Error("A Frenet recusou o acesso. Peça à gestão para conferir a conexão da conta.");
      if (r.status === 429)
        throw Error(
          "O limite de consultas da Frenet foi atingido. Aguarde antes de tentar novamente.",
        );
      if (!r.ok) throw Error("A Frenet está indisponível para cotação. Tente novamente.");
      let raw: unknown;
      try {
        raw = await r.json();
      } catch {
        throw Error("A Frenet retornou uma resposta inválida.");
      }
      const payload = z
        .object({ ShippingSevicesArray: z.array(z.unknown()).max(200) })
        .safeParse(raw);
      if (!payload.success) throw Error("A Frenet retornou uma resposta inválida.");
      const linhas: Linha[] = [];
      for (const item of payload.data.ShippingSevicesArray) {
        const parsed = linhaSchema.safeParse(item);
        if (!parsed.success || parsed.data.Error || parsed.data.CarrierCode === "ISP") continue;
        const centavos = valorCentavos(parsed.data.ShippingPrice);
        if (centavos === null) continue;
        linhas.push({ ...parsed.data, centavos, dias: prazoDias(parsed.data.DeliveryTime) });
      }
      const repetidos = new Set(
        linhas
          .filter((l, i) => linhas.findIndex((x) => chaveServico(x) === chaveServico(l)) !== i)
          .map(chaveServico),
      );
      const validas = linhas.filter((l) => !repetidos.has(chaveServico(l)));
      resultados.set(key, validas);
      if (enviar === fetch) {
        if (cache.size >= 200) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { ate: agora + 60_000, linhas: validas });
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(4, fila.length) }, consultar));
  } finally {
    controller.abort();
  }
  const porVolume = consultas.map((v) => ({
    id: v.id,
    linhas: resultados.get(JSON.stringify(v.body)) || [],
  }));
  const cotacoes: Cotacao[] = [];
  for (const primeira of porVolume[0].linhas) {
    const linhas = porVolume.map((v) =>
      v.linhas.find((l) => chaveServico(l) === chaveServico(primeira)),
    );
    if (linhas.some((l) => !l)) continue;
    const valoresVolumes = Object.fromEntries(porVolume.map((v, i) => [v.id, linhas[i]!.centavos]));
    const valor = Object.values(valoresVolumes).reduce((a, b) => a + b, 0);
    if (!Number.isSafeInteger(valor) || valor > 100_000_000) continue;
    const dias = linhas.every((l) => l!.dias !== undefined)
      ? Math.max(...linhas.map((l) => l!.dias!))
      : undefined;
    const ponto = cfg.postagens.find(
      (x) =>
        x.origemCep === p.origemCep &&
        x.transportadoraCodigo === primeira.CarrierCode &&
        x.servicoCodigo === primeira.ServiceCode,
    );
    const c = cotacaoSchema.parse({
      id: `frenet-${crypto.randomUUID()}`,
      modalidade: `${primeira.Carrier} · ${primeira.ServiceDescription}`.slice(0, 100),
      transportadora: primeira.Carrier,
      servicoCodigo: primeira.ServiceCode,
      prazo: dias === undefined ? "Prazo a confirmar" : `Até ${dias} dias úteis`,
      prazoDias: dias,
      modo: "volumes",
      valor,
      valoresVolumes,
      assinatura: assinaturaFrete(p),
      registradaEm: new Date(agora).toISOString(),
      oficial: true,
      provedor: "frenet",
      postagem: ponto
        ? { tipo: ponto.tipo, descricao: ponto.descricao, origemCep: ponto.origemCep }
        : undefined,
    });
    const expira = String(agora + 15 * 60_000);
    c.comprovante = `${expira}.${assinaturaCotacao(c, expira, empresa, ator, p.leadId, cfg.chaveAssinatura)}`;
    cotacoes.push(c);
  }
  if (!cotacoes.length)
    throw Error("Nenhum serviço da Frenet atende todas as caixas desta remessa.");
  return cotacoes.sort((a, b) => a.valor - b.valor).slice(0, 20);
}
