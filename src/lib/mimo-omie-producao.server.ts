import { z } from "zod";
import { cfopOmieSchema, codigoOmieSchema, pedidoOmieSchema } from "./mimo-omie";
import { chamarOmie, lerPedidoComercialOmie } from "./mimo-omie-envio.server";
import { hashOmie, type ConfigOmie } from "./mimo-omie.server";

const fetchOmie: typeof fetch = (...args) => globalThis.fetch(...args);
type PedidoVinculado = { codigo: number; integracao: string; assinatura: string };
const chaveSchema = z.string().regex(/^\d{44}$/);
const dataOmieSchema = z
  .string()
  .regex(/^\d{2}\/\d{2}\/\d{4}$/)
  .transform((v) => v.split("/").reverse().join("-"))
  .pipe(z.iso.date());

export async function conferirDadosFiscaisOmie(
  cfg: ConfigOmie,
  pedido: PedidoVinculado,
  fetcher = fetchOmie,
) {
  const atual = await lerPedidoComercialOmie(cfg, pedido.integracao, fetcher).catch(() => {
    throw Error("Não foi possível conferir o pedido no Omie.");
  });
  if (
    atual.remoto.cabecalho.codigo_pedido !== pedido.codigo ||
    atual.assinatura !== pedido.assinatura
  )
    throw Error(
      "Os dados comerciais do pedido mudaram no Omie. Confira o pedido antes de faturar.",
    );
  const fiscal = pedidoOmieSchema.safeParse(atual.documento);
  if (!fiscal.success) throw Error("O Omie não devolveu os dados fiscais completos do pedido.");
  return { faturado: fiscal.data.infoCadastro.faturado === "S", fiscal: fiscal.data };
}

export async function consultarAutorizacaoOmie(
  cfg: ConfigOmie,
  pedido: PedidoVinculado,
  fetcher = fetchOmie,
) {
  const status = z
    .object({
      codigo_pedido: z.literal(pedido.codigo),
      codigo_pedido_integracao: z.literal(pedido.integracao),
      cancelada: z.enum(["S", "N"]),
      faturada: z.enum(["S", "N"]),
      ambiente: z.string(),
      ListaNfe: z
        .array(z.object({ chave_nfe: z.string().nullish(), tipo: z.string().nullish() }))
        .nullish(),
    })
    .parse(
      await chamarOmie(
        cfg,
        "produtos/pedido",
        "StatusPedido",
        { codigo_pedido: pedido.codigo },
        fetcher,
      ),
    );
  if (status.cancelada === "S") return { estado: "cancelado" as const };
  const notas = status.ListaNfe ?? [];
  if (status.faturada === "N" && notas.length === 0)
    return { estado: "aberto" as const, producao: status.ambiente === "P" };

  const resultado = z
    .object({
      nTotPaginas: z.number().int().min(0).max(1),
      etapasPedido: z
        .array(
          z.object({
            nCodPed: z.literal(pedido.codigo),
            cCodIntPed: z.literal(pedido.integracao),
            cancelamento: z.object({ cCancelado: z.literal("N") }),
            faturamento: z.object({
              cAutorizado: z.string().nullish(),
              cDenegado: z.string().nullish(),
              cFaturado: z.string().nullish(),
              cAmbiente: z.string().nullish(),
              cChaveNFE: z.string().nullish(),
              cNumNFE: z.string().nullish(),
              dDtFat: z.string().nullish(),
            }),
          }),
        )
        .default([]),
    })
    .parse(
      await chamarOmie(
        cfg,
        "produtos/pedidoetapas",
        "ListarEtapasPedido",
        {
          nPagina: 1,
          nRegPorPagina: 20,
          nCodPed: pedido.codigo,
        },
        fetcher,
      ),
    );
  const f = resultado.etapasPedido.length === 1 ? resultado.etapasPedido[0].faturamento : null;
  if (f?.cDenegado === "S") return { estado: "denegado" as const };
  if (
    f?.cAutorizado !== "S" ||
    f.cFaturado !== "S" ||
    status.faturada !== "S" ||
    f.cAmbiente !== "P" ||
    status.ambiente !== "P" ||
    notas.length !== 1 ||
    notas[0].tipo !== "S" ||
    notas[0].chave_nfe !== f.cChaveNFE
  ) {
    return { estado: "aguardando" as const };
  }
  return {
    estado: "autorizado" as const,
    nfe: {
      chave: chaveSchema.parse(f.cChaveNFE),
      numero: z
        .string()
        .regex(/^\d{1,10}$/)
        .parse(f.cNumNFE),
      data: dataOmieSchema.parse(f.dDtFat),
    },
  };
}

export async function validarEmissaoOmie(
  cfg: ConfigOmie,
  pedido: PedidoVinculado,
  fetcher = fetchOmie,
) {
  const antes = await conferirDadosFiscaisOmie(cfg, pedido, fetcher);
  if (
    antes.faturado ||
    antes.fiscal.det.some(
      (item) =>
        !cfopOmieSchema.safeParse(item.produto.cfop).success || !Object.keys(item.imposto).length,
    )
  ) {
    throw Error("Confira o CFOP, os impostos e a situação do pedido no Omie.");
  }
  const resposta = await chamarOmie(
    cfg,
    "produtos/pedidovendafat",
    "ValidarPedidoVenda",
    {
      nCodPed: pedido.codigo,
    },
    fetcher,
  ).catch(() => null);
  const valido = z
    .object({ nCodPed: z.literal(pedido.codigo), cCodStatus: z.literal("0") })
    .safeParse(resposta);
  if (!valido.success)
    throw Error("O Omie recusou a validação fiscal. Verifique as pendências no Omie.");
  const depois = await conferirDadosFiscaisOmie(cfg, pedido, fetcher);
  if (depois.faturado || (await hashOmie(antes.fiscal)) !== (await hashOmie(depois.fiscal)))
    throw Error(
      "O pedido mudou durante a validação. Confira os dados fiscais e consulte novamente.",
    );
}

export async function solicitarEmissaoOmie(cfg: ConfigOmie, codigo: number, fetcher = fetchOmie) {
  const nCodPed = codigoOmieSchema.parse(codigo);
  z.object({ nCodPed: z.literal(nCodPed), cCodStatus: z.literal("0") }).parse(
    await chamarOmie(cfg, "produtos/pedidovendafat", "FaturarPedidoVenda", { nCodPed }, fetcher),
  );
}
