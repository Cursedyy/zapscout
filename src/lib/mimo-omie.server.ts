import { z } from "zod";
import { codigoOmieSchema, pedidoOmieSchema } from "./mimo-omie";

const envSchema = z.object({
  OMIE_APP_KEY: z.string().trim().min(1),
  OMIE_APP_SECRET: z.string().trim().min(1),
  MIMO_OMIE_EMPRESA_ID: z.string().uuid(),
  // Only simulation is available in this release. Unknown/write modes fail closed.
  MIMO_OMIE_MODO: z.literal("simulacao").default("simulacao"),
});
export function configOmie(env = process.env) {
  const r = envSchema.safeParse(env);
  return r.success
    ? {
        appKey: r.data.OMIE_APP_KEY,
        secret: r.data.OMIE_APP_SECRET,
        empresaId: r.data.MIMO_OMIE_EMPRESA_ID,
        modo: r.data.MIMO_OMIE_MODO,
      }
    : null;
}
export type ConfigOmie = NonNullable<ReturnType<typeof configOmie>>;

function canonicalizar(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalizar).join(",")}]`;
  if (v !== null && typeof v === "object")
    return `{${Object.entries(v)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, val]) => `${JSON.stringify(k)}:${canonicalizar(val)}`)
      .join(",")}}`;
  return JSON.stringify(v);
}
export async function hashOmie(valor: unknown) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalizar(valor))),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function versaoOmie(cfg: ConfigOmie, pedido: unknown) {
  return hashOmie({ empresa: cfg.empresaId, app: cfg.appKey, pedido });
}

export async function idempotenciaPreviaOmie(
  versao: string,
  mudancas: Array<{ itemId: number; anterior: string; novo: string }>,
) {
  return hashOmie({ versao, mudancas });
}

export async function consultarPedidoOmie(cfg: ConfigOmie, pedidoId: number, fetcher = fetch) {
  codigoOmieSchema.parse(pedidoId);
  try {
    const resposta = await fetcher("https://app.omie.com.br/api/v1/produtos/pedido/", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ConsultarPedido",
        app_key: cfg.appKey,
        app_secret: cfg.secret,
        param: [{ codigo_pedido: pedidoId }],
      }),
    });
    if (!resposta.ok) throw Error("http");
    const bruto = await resposta.json();
    if (bruto?.faultcode || bruto?.faultstring) throw Error("omie");
    // The official response wraps the document in pedido_venda_produto.
    const resultado = pedidoOmieSchema.safeParse(bruto?.pedido_venda_produto);
    if (!resultado.success || resultado.data.cabecalho.codigo_pedido !== pedidoId)
      throw Error("pedido");
    return bruto.pedido_venda_produto as z.infer<typeof pedidoOmieSchema>;
  } catch {
    // Never surface provider bodies, credentials, schema details or transport errors.
    throw Error(
      "Não foi possível consultar este pedido no OMIE. Confira o código e tente novamente.",
    );
  }
}
