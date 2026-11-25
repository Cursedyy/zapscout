import { z } from "zod";

export const codigoOmieSchema = z.number().int().positive().safe();
export const cfopOmieSchema = z
  .string()
  .trim()
  .regex(/^\d\.?\d{3}$/, "Informe os quatro dígitos do CFOP validado pela contabilidade.")
  .transform((v) => v.replace(".", ""))
  .transform((v) => `${v[0]}.${v.slice(1)}`);
export const mudancasCfopSchema = z
  .array(
    z
      .object({
        itemId: codigoOmieSchema,
        cfop: cfopOmieSchema,
      })
      .strict(),
  )
  .min(1)
  .max(199)
  .refine(
    (itens) => new Set(itens.map((i) => i.itemId)).size === itens.length,
    "Selecione cada item apenas uma vez.",
  );
export const consultarOmieSchema = z.object({ pedidoId: codigoOmieSchema }).strict();
export const prepararCfopSchema = consultarOmieSchema
  .extend({
    versao: z.string().regex(/^[a-f0-9]{64}$/),
    mudancas: mudancasCfopSchema,
  })
  .strict();
export const confirmarCfopSchema = z
  .object({ previaId: z.string().uuid(), confirmar: z.literal(true) })
  .strict();

// Validate required identities without stripping unknown fiscal/commercial fields.
export const pedidoOmieSchema = z
  .object({
    cabecalho: z
      .object({ codigo_pedido: codigoOmieSchema, numero_pedido: z.string().optional() })
      .passthrough(),
    det: z
      .array(
        z
          .object({
            ide: z
              .object({ codigo_item: codigoOmieSchema, acao_item: z.string().optional() })
              .passthrough(),
            produto: z
              .object({ cfop: z.string(), descricao: z.string().max(500).optional() })
              .passthrough(),
            imposto: z.record(z.string(), z.unknown()),
          })
          .passthrough(),
      )
      .min(1)
      .max(199),
    infoCadastro: z
      .object({ faturado: z.enum(["S", "N"]), cancelado: z.enum(["S", "N"]) })
      .passthrough(),
  })
  .passthrough();
export type PedidoOmie = z.infer<typeof pedidoOmieSchema>;
export type MudancaCfop = { itemId: number; anterior: string; novo: string };
export type PreviaCfop = {
  id: string;
  pedidoId: number;
  expiraEm: string;
  mudancas: MudancaCfop[];
};

export function alterarSomenteCfop(bruto: unknown, entrada: unknown) {
  const pedido = pedidoOmieSchema.parse(bruto);
  const mudancas = mudancasCfopSchema.parse(entrada);
  if (pedido.infoCadastro.faturado !== "N" || pedido.infoCadastro.cancelado !== "N")
    throw Error("Use apenas pedidos não faturados e não cancelados.");
  if (
    new Set(pedido.det.map((i) => i.ide.codigo_item)).size !== pedido.det.length ||
    pedido.det.some((i) => i.ide.acao_item)
  )
    throw Error("Os itens do pedido exigem revisão no OMIE.");
  // Clone the original, not the parsed result: even nested unknown fields must survive.
  const documento = structuredClone(bruto) as PedidoOmie;
  const diferencas: MudancaCfop[] = [];
  for (const mudanca of mudancas) {
    const item = documento.det.find((i) => i.ide.codigo_item === mudanca.itemId);
    if (!item) throw Error("Item indisponível no pedido consultado.");
    const anterior = item.produto.cfop;
    if (cfopOmieSchema.safeParse(anterior).data === mudanca.cfop) continue;
    item.produto.cfop = mudanca.cfop;
    diferencas.push({ itemId: mudanca.itemId, anterior, novo: mudanca.cfop });
  }
  if (!diferencas.length) throw Error("Informe um CFOP diferente do atual.");
  return { documento, mudancas: diferencas };
}
