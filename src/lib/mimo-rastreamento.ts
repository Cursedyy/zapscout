import { z } from "zod";
import { buscaSegura } from "./mimo-tira-regras";
import type { Cotacao, PedidoSalvo, StatusPedido } from "./mimo-pedido";

export const STATUS_ENTREGA = ["faturado", "enviado", "entregue"] as const;
export type StatusEntrega = (typeof STATUS_ENTREGA)[number];

const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((valor) => {
    const data = new Date(`${valor}T12:00:00Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
  }, "Data inválida.");

export const filtroRastreamentoSchema = z
  .object({
    busca: z.string().trim().max(100).default(""),
    status: z.enum(STATUS_ENTREGA).nullable().default(null),
    inicio: dataSchema.nullable().default(null),
    fim: dataSchema.nullable().default(null),
    pagina: z.number().int().min(1).max(10_000).default(1),
    porPagina: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .superRefine((filtro, contexto) => {
    if (filtro.inicio && filtro.fim && filtro.inicio > filtro.fim) {
      contexto.addIssue({
        code: "custom",
        path: ["fim"],
        message: "A data final deve ser igual ou posterior à inicial.",
      });
    }
  });

export type FiltroRastreamento = z.infer<typeof filtroRastreamentoSchema>;

export type EntregaMimo = {
  id: string;
  empresaId: string;
  numero: number;
  cliente: string;
  status: StatusEntrega;
  criadoEm: string;
  atualizadoEm: string;
  faturadoEm: string | null;
  transportadora: string | null;
  modalidade: string | null;
  codigoServico: string | null;
  prazo: string | null;
  postagem: Cotacao["postagem"] | null;
};

export function entregaDoPedido(pedido: PedidoSalvo): EntregaMimo | null {
  if (!STATUS_ENTREGA.includes(pedido.status as StatusEntrega)) return null;
  const cotacao = pedido.documento.cotacoes.find((item) => item.id === pedido.documento.cotacaoId);
  return {
    id: pedido.id,
    empresaId: pedido.empresa_id,
    numero: pedido.numero,
    cliente: pedido.documento.cliente,
    status: pedido.status as StatusEntrega,
    criadoEm: pedido.created_at,
    atualizadoEm: pedido.updated_at,
    faturadoEm: pedido.documento.pagamento.faturadoEm,
    transportadora: cotacao?.transportadora ?? null,
    modalidade: cotacao?.modalidade ?? null,
    codigoServico: cotacao?.servicoCodigo ?? null,
    prazo: cotacao?.prazo ?? null,
    postagem: cotacao?.postagem ?? null,
  };
}

export function correspondeBuscaEntrega(entrega: EntregaMimo, entrada: string) {
  const busca = buscaSegura(entrada).toLocaleLowerCase("pt-BR");
  if (!busca) return true;
  return [String(entrega.numero), entrega.cliente, entrega.codigoServico ?? ""].some((valor) =>
    valor.toLocaleLowerCase("pt-BR").includes(busca),
  );
}

export function filtrarEntregas(pedidos: PedidoSalvo[], busca: string) {
  return pedidos
    .map(entregaDoPedido)
    .filter(
      (entrega): entrega is EntregaMimo => !!entrega && correspondeBuscaEntrega(entrega, busca),
    );
}

export function statusEntrega(status: StatusPedido) {
  return status === "faturado"
    ? "Preparando envio"
    : status === "enviado"
      ? "Enviado"
      : status === "entregue"
        ? "Entregue"
        : null;
}
