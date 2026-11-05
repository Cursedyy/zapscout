import { z } from "zod";
import {
  centavosNuvem,
  idNuvemSchema,
  linkCarrinhoSeguro,
  type CarrinhoRegistro,
  type PedidoNuvemRegistro,
} from "./mimo-carrinhos";

export type ConfigNuvem = {
  empresa: string;
  loja: string;
  token: string;
  agente: string;
  hosts: string[];
};
export function configNuvem(env = process.env): ConfigNuvem | null {
  const r = z
    .object({
      MIMO_NUVEMSHOP_EMPRESA_ID: z.string().uuid(),
      MIMO_NUVEMSHOP_STORE_ID: idNuvemSchema,
      MIMO_NUVEMSHOP_ACCESS_TOKEN: z.string().min(10),
      MIMO_NUVEMSHOP_USER_AGENT: z.string().min(5),
      MIMO_NUVEMSHOP_CHECKOUT_HOSTS: z.string().min(1),
    })
    .safeParse(env);
  if (!r.success) return null;
  const hosts = r.data.MIMO_NUVEMSHOP_CHECKOUT_HOSTS.split(",").map((s) => s.trim().toLowerCase());
  if (!hosts.length || hosts.some((h) => !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(h)))
    return null;
  return {
    empresa: r.data.MIMO_NUVEMSHOP_EMPRESA_ID,
    loja: String(r.data.MIMO_NUVEMSHOP_STORE_ID),
    token: r.data.MIMO_NUVEMSHOP_ACCESS_TOKEN,
    agente: r.data.MIMO_NUVEMSHOP_USER_AGENT,
    hosts,
  };
}
const texto = z
  .string()
  .max(300)
  .nullish()
  .transform((v) => v?.trim() ?? "");
const dataNuvem = z
  .string()
  .refine((v) => /T/.test(v) && /(?:Z|[+-]\d{2}:?\d{2})$/.test(v) && Number.isFinite(Date.parse(v)))
  .transform((v) => new Date(v).toISOString());
const comum = {
  id: idNuvemSchema,
  store_id: idNuvemSchema,
  token: z.string().min(10).max(300),
  total: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  updated_at: dataNuvem,
};
const checkoutSchema = z.object({
  ...comum,
  created_at: dataNuvem,
  contact_name: texto,
  contact_email: texto,
  contact_phone: texto,
  abandoned_checkout_url: z.string().nullish(),
  products: z
    .array(
      z.object({ name: z.string().max(300), quantity: z.number().int().positive().max(1000000) }),
    )
    .max(1000),
});
const pedidoSchema = z.object({
  ...comum,
  number: idNuvemSchema,
  status: z.enum(["open", "closed", "cancelled"]),
  payment_status: z.enum([
    "authorized",
    "pending",
    "paid",
    "partially_paid",
    "abandoned",
    "refunded",
    "partially_refunded",
    "voided",
  ]),
});
async function hashToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
export async function normalizarCheckout(
  raw: unknown,
  cfg: ConfigNuvem,
): Promise<CarrinhoRegistro> {
  const c = checkoutSchema.parse(raw);
  if (c.store_id !== cfg.loja) throw Error("Loja divergente na resposta da Nuvemshop.");
  const email = z.string().email().safeParse(c.contact_email);
  const telefone = c.contact_phone.replace(/[^\d+]/g, "");
  return {
    checkout_id: c.id,
    token_hash: await hashToken(c.token),
    nome: c.contact_name,
    email: email.success ? email.data : "",
    telefone: /^\+?[1-9]\d{9,14}$/.test(telefone) ? telefone : "",
    total: centavosNuvem(c.total),
    moeda: c.currency,
    url: linkCarrinhoSeguro(c.abandoned_checkout_url, cfg.hosts),
    origem_created_at: c.created_at,
    origem_updated_at: c.updated_at,
    itens: c.products.map((p) => ({ nome: p.name, quantidade: p.quantity })),
  };
}
export async function normalizarPedido(
  raw: unknown,
  cfg: ConfigNuvem,
): Promise<PedidoNuvemRegistro> {
  const p = pedidoSchema.parse(raw);
  if (p.store_id !== cfg.loja) throw Error("Loja divergente na resposta da Nuvemshop.");
  return {
    pedido_id: p.id,
    token_hash: await hashToken(p.token),
    numero: p.number,
    status: p.status,
    pagamento: p.payment_status,
    total: centavosNuvem(p.total),
    moeda: p.currency,
    origem_updated_at: p.updated_at,
  };
}
// Fixed API host and paths. Never send the credential to a checkout URL or follow redirects.
export async function lerPaginasNuvem(
  cfg: ConfigNuvem,
  recurso: "checkouts" | "orders",
  fetcher = fetch,
  agora = new Date(),
) {
  const registros: unknown[] = [];
  for (let page = 1; page <= 101; page++) {
    const url = new URL(`https://api.nuvemshop.com.br/2025-03/${cfg.loja}/${recurso}`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");
    if (recurso === "orders") {
      url.searchParams.set(
        "updated_at_min",
        new Date(agora.getTime() - 31 * 86400000).toISOString(),
      );
      url.searchParams.set(
        "fields",
        "id,store_id,token,number,status,payment_status,total,currency,updated_at",
      );
    } else
      url.searchParams.set(
        "fields",
        "id,store_id,token,contact_name,contact_email,contact_phone,abandoned_checkout_url,total,currency,created_at,updated_at,products",
      );
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: { Authorization: `Bearer ${cfg.token}`, "User-Agent": cfg.agente },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw Error("Não foi possível acessar a Nuvemshop. Tente novamente.");
    }
    if (!response.ok) {
      if ([401, 403].includes(response.status))
        throw Error("Confira a autorização da loja e a permissão read_orders.");
      if (response.status === 429)
        throw Error("Limite da Nuvemshop atingido. Aguarde antes de sincronizar novamente.");
      throw Error("Falha ao consultar a Nuvemshop. Nenhuma sincronização foi concluída.");
    }
    let rows: unknown;
    try {
      rows = await response.json();
    } catch {
      throw Error("Resposta inválida da Nuvemshop.");
    }
    if (!Array.isArray(rows) || rows.length > 100) throw Error("Página inválida da Nuvemshop.");
    registros.push(...rows);
    if (registros.length > 10000)
      throw Error("Volume excedeu esta etapa. Nenhuma sincronização parcial foi gravada.");
    if (rows.length < 100) return registros;
  }
  throw Error("Paginação incompleta. Nenhuma sincronização parcial foi gravada.");
}
export async function coletarNuvem(cfg: ConfigNuvem, fetcher = fetch) {
  const carrinhos = await lerPaginasNuvem(cfg, "checkouts", fetcher);
  const pedidos = await lerPaginasNuvem(cfg, "orders", fetcher);
  try {
    return {
      carrinhos: await Promise.all(carrinhos.map((c) => normalizarCheckout(c, cfg))),
      pedidos: await Promise.all(pedidos.map((p) => normalizarPedido(p, cfg))),
    };
  } catch {
    throw Error("Dados inconsistentes recebidos da Nuvemshop. Nenhuma sincronização foi gravada.");
  }
}
