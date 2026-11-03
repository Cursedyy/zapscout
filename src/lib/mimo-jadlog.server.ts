import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  assinaturaFrete,
  avaliarVolume,
  caixaDoVolume,
  conferirDistribuicao,
  type Cotacao,
  type Pedido,
} from "./mimo-pedido";

const servicoSchema = z.object({
  codigo: z.number().int().positive(),
  nome: z.string().trim().min(1).max(80),
  divisorCubagem: z.number().positive().max(100000),
});
export const configJadlogSchema = z.object({
  token: z.string().trim().min(1),
  cnpj: z.string().regex(/^\d{14}$/),
  conta: z.string().max(20).default(""),
  contrato: z.string().max(20).nullable().default(null),
  servicos: z
    .array(servicoSchema)
    .min(1)
    .max(3)
    .refine((s) => new Set(s.map((x) => x.codigo)).size === s.length),
});
export type ConfigJadlog = z.infer<typeof configJadlogSchema>;
export function configJadlog(): ConfigJadlog | null {
  try {
    return configJadlogSchema.parse({
      token: process.env.MIMO_JADLOG_TOKEN,
      cnpj: process.env.MIMO_JADLOG_CNPJ,
      conta: process.env.MIMO_JADLOG_CONTA ?? "",
      contrato: process.env.MIMO_JADLOG_CONTRATO ?? null,
      servicos: JSON.parse(process.env.MIMO_JADLOG_SERVICOS ?? "null"),
    });
  } catch {
    return null;
  }
}
export function montarFreteJadlog(p: Pedido, cfg: ConfigJadlog) {
  if (
    !p.leadId ||
    !/^\d{8}$/.test(p.origemCep) ||
    !/^\d{8}$/.test(p.destinoCep) ||
    !p.endereco.trim()
  )
    throw Error("Informe o cliente, CEP e endereço de entrega.");
  if (!p.itens.length || !p.volumes.length || !conferirDistribuicao(p.itens, p.volumes))
    throw Error("Confira a distribuição dos produtos nas caixas.");
  if (p.declarado <= 0) throw Error("Confira o valor da mercadoria antes de calcular o frete.");
  const volumes = p.volumes.map((v) => {
    const a = avaliarVolume(v, p.itens);
    if (!v.confirmado || !v.conteudo.length || a.pesoCotacaoG === null || a.pesoCotacaoG <= 0)
      throw Error("Confira as caixas e informe o peso dos volumes pendentes.");
    return { peso: a.pesoCotacaoG / 1000, dimensoes: caixaDoVolume(v).dimensoes };
  });
  const real = volumes.reduce((n, v) => n + v.peso, 0);
  return {
    frete: cfg.servicos.map((s) => {
      const cubado = volumes.reduce(
        (n, v) => n + v.dimensoes.reduce((a, b) => a * b, 1) / s.divisorCubagem,
        0,
      );
      return {
        cepori: p.origemCep,
        cepdes: p.destinoCep,
        frap: "N",
        peso: Math.ceil(Math.max(real, cubado) * 1000) / 1000,
        cnpj: cfg.cnpj,
        conta: cfg.conta || null,
        contrato: cfg.contrato,
        modalidade: s.codigo,
        tpentrega: "D",
        tpseguro: "N",
        vldeclarado: p.declarado / 100,
      };
    }),
  };
}
const respostaSchema = z.object({
  erro: z.unknown().optional(),
  error: z.unknown().optional(),
  frete: z
    .array(
      z.object({
        modalidade: z.number().int(),
        vltotal: z.number().finite().nonnegative().max(1000000).optional(),
        prazo: z.number().int().nonnegative().max(365).optional(),
        erro: z.unknown().optional(),
        error: z.unknown().optional(),
      }),
    )
    .max(3)
    .optional(),
});
function mac(c: Cotacao, expira: string, empresa: string, ator: string, token: string, leadId: string | null) {
  const cotacao = [c.id, c.modalidade, c.prazo, c.modo, c.valor, Object.entries(c.valoresVolumes).sort(([a], [b]) => a.localeCompare(b)), c.assinatura, c.registradaEm, c.oficial, c.provedor];
  return createHmac("sha256", token)
    .update(JSON.stringify({ versao: "mimo-jadlog-1", empresa, ator, leadId, expira, cotacao }))
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
    if (c.provedor !== "jadlog") continue;
    if (anterior?.cotacoes.some((old) => JSON.stringify(old) === JSON.stringify(c))) continue;
    const [expira, assinatura] = (c.comprovante ?? "").split(".");
    if (
      !cfg ||
      !/^\d+$/.test(expira ?? "") ||
      !/^[a-f0-9]{64}$/.test(assinatura ?? "") ||
      (c.id === p.cotacaoId && Number(expira) < agora) ||
      Number(expira) > agora + 16 * 60_000
    )
      throw Error("A cotação Jadlog expirou ou não é válida. Calcule o frete novamente.");
    const esperado = mac(c, expira, empresa, ator, cfg.token, p.leadId);
    if (!timingSafeEqual(Buffer.from(esperado, "hex"), Buffer.from(assinatura, "hex")))
      throw Error("A cotação Jadlog foi alterada. Calcule o frete novamente.");
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
  const payload = montarFreteJadlog(p, cfg);
  let resposta: Response;
  try {
    resposta = await enviar("https://www.jadlog.com.br/embarcador/api/frete/valor", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: cfg.token },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw Error("Não foi possível consultar a Jadlog. Tente novamente.");
  }
  if (!resposta.ok)
    throw Error("A Jadlog recusou a consulta. Confira a configuração da integração.");
  let dados: z.infer<typeof respostaSchema>;
  try {
    dados = respostaSchema.parse(await resposta.json());
  } catch {
    throw Error("A Jadlog retornou uma resposta inválida. Tente novamente.");
  }
  if (dados.erro || dados.error)
    throw Error("A Jadlog não conseguiu cotar esta remessa. Confira os dados e o contrato.");
  const cotacoes: Cotacao[] = [];
  const vistos = new Set<number>();
  for (const r of dados.frete ?? []) {
    const servico = cfg.servicos.find((s) => s.codigo === r.modalidade);
    if (!servico || vistos.has(r.modalidade) || r.erro || r.error || r.vltotal === undefined)
      continue;
    vistos.add(r.modalidade);
    const c: Cotacao = {
      id: `jadlog-${crypto.randomUUID()}`,
      modalidade: `Jadlog ${servico.nome}`,
      prazo: r.prazo === undefined ? "Prazo a confirmar" : `${r.prazo} dias úteis`,
      modo: "remessa",
      valor: Math.round(r.vltotal * 100),
      valoresVolumes: {},
      assinatura: assinaturaFrete(p),
      registradaEm: new Date(agora).toISOString(),
      oficial: true,
      provedor: "jadlog",
    };
    const expira = String(agora + 15 * 60_000);
    c.comprovante = `${expira}.${mac(c, expira, empresa, ator, cfg.token, p.leadId)}`;
    cotacoes.push(c);
  }
  if (!cotacoes.length) throw Error("Não há cotação Jadlog disponível para esta remessa.");
  return cotacoes;
}
