import { z } from "zod";

export const idNuvemSchema = z.union([
  z.string().regex(/^[1-9]\d{0,18}$/),
  z.number().int().positive().max(Number.MAX_SAFE_INTEGER).transform(String),
]);
export function centavosNuvem(valor: unknown): number {
  const s = z
    .string()
    .regex(/^\d{1,12}(\.\d{1,2})?$/)
    .parse(valor);
  const [reais, centavos = ""] = s.split(".");
  const total = Number(reais) * 100 + Number(centavos.padEnd(2, "0"));
  if (!Number.isSafeInteger(total)) throw Error("Valor monetário inválido.");
  return total;
}
export function linkCarrinhoSeguro(valor: unknown, hosts: readonly string[]): string | null {
  if (typeof valor !== "string" || valor.length > 2000) return null;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      hosts.includes(url.hostname.toLowerCase()) &&
      url.pathname.startsWith("/checkout/")
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export type CarrinhoRegistro = {
  checkout_id: string;
  token_hash: string;
  nome: string;
  email: string;
  telefone: string;
  total: number;
  moeda: string;
  url: string | null;
  origem_updated_at: string;
  origem_created_at: string;
  itens: { nome: string; quantidade: number }[];
};
export type PedidoNuvemRegistro = {
  pedido_id: string;
  token_hash: string;
  numero: string;
  status: string;
  pagamento: string;
  total: number;
  moeda: string;
  origem_updated_at: string;
};
export function situacaoCarrinho(
  c: Pick<CarrinhoRegistro, "email" | "telefone">,
  p?: PedidoNuvemRegistro,
) {
  if (p) {
    if (p.status === "cancelled") return "Pedido cancelado";
    if (["refunded", "voided"].includes(p.pagamento)) return "Pagamento estornado";
    if (p.pagamento === "paid") return "Pagamento confirmado";
    return "Compra identificada";
  }
  return c.email || c.telefone ? "Aguardando revisão" : "Sem contato";
}
export function canaisCarrinho(c: Pick<CarrinhoRegistro, "email" | "telefone">) {
  return (
    [c.telefone ? "WhatsApp" : null, c.email ? "E-mail" : null].filter(Boolean).join(" e ") ||
    "Nenhum"
  );
}
