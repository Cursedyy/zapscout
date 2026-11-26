import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { codigoOmieSchema } from "./mimo-omie";
import { cadastroFiscalSchema, montarInclusaoPedidoOmie } from "./mimo-omie-faturamento";
import { pedidoSchema, type PedidoSalvo, type Recebimento } from "./mimo-pedido";
import { tiraClient } from "./mimo-pedido-db";
import { opcoesStatus } from "./mimo-tira-regras";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const referenciaSchema = z
  .object({ id: z.string().uuid(), versao: z.number().int().positive() })
  .strict();
const documentoClienteSchema = z
  .string()
  .trim()
  .max(24)
  .regex(/^[\d./-]+$/)
  .transform((valor) => valor.replace(/\D/g, ""))
  .pipe(z.string().regex(/^(\d{11}|\d{14})$/, "Informe o CPF ou CNPJ do cliente."));
const clienteSchema = referenciaSchema.extend({ documento: documentoClienteSchema });
const envioSchema = clienteSchema.extend({
  clienteId: codigoOmieSchema,
  dataPrevisao: z.string(),
  versaoProdutos: z.string().regex(/^[a-f0-9]{64}$/),
  fiscal: cadastroFiscalSchema.omit({ codigoCliente: true, produtosPorItem: true }).strict(),
});
const reservaSchema = z.object({
  reservado: z.boolean(),
  codigo: codigoOmieSchema.nullable(),
  numero: z.string().nullable(),
});

export type Contexto = { supabase: SupabaseClient<Database>; userId: string };

async function carregarPedidoEnvio(contexto: Contexto, dados: z.infer<typeof referenciaSchema>) {
  const { exigirMimo } = await import("./mimo-leads.server");
  const { configOmie } = await import("./mimo-omie.server");
  const acesso = await exigirMimo(contexto.supabase, contexto.userId);
  if (!opcoesStatus(acesso.papel, "confirmado").includes("faturado")) throw Error("Acesso negado.");
  const cfg = configOmie();
  if (!cfg || cfg.empresaId !== acesso.empresaId)
    throw Error("O Omie ainda não está configurado para esta empresa.");
  const atual = await tiraClient(contexto.supabase)
    .from("mimo_tira_pedidos_seguros")
    .select("*")
    .eq("empresa_id", acesso.empresaId)
    .eq("id", dados.id)
    .eq("versao", dados.versao)
    .eq("status", "confirmado")
    .maybeSingle();
  if (atual.error || !atual.data)
    throw Error("O pedido foi alterado ou não está mais confirmado. Reabra a lista.");
  const documento = pedidoSchema.parse(atual.data.documento);
  const pedido: PedidoSalvo = {
    ...atual.data,
    documento,
    status: documento.status,
    pix: atual.data.pix as Recebimento,
    recebimentos: atual.data.recebimentos as Recebimento[],
  };
  return { cfg, pedido };
}

function vinculosProdutos() {
  try {
    return z
      .record(z.string().trim().min(1).max(83), codigoOmieSchema)
      .parse(JSON.parse(process.env.MIMO_OMIE_VINCULOS_PRODUTOS ?? "{}"));
  } catch {
    throw Error("Confira a configuração dos vínculos de produtos da MiMo com o Omie.");
  }
}

export const consultarProdutosPedidoEnvioOmieMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(referenciaSchema)
  .handler(async ({ context, data }) => {
    const { cfg, pedido } = await carregarPedidoEnvio(context, data);
    const { resolverProdutosOmie } = await import("./mimo-omie-envio.server");
    const { hashOmie } = await import("./mimo-omie.server");
    const itens = await resolverProdutosOmie(cfg, pedido.documento.itens, vinculosProdutos());
    return {
      itens,
      versaoProdutos: await hashOmie(itens),
      envioAtivo: process.env.MIMO_OMIE_ENVIO_PEDIDO === "ativo",
    };
  });

export const consultarClientePedidoEnvioOmieMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(clienteSchema)
  .handler(async ({ context, data }) => {
    const { cfg } = await carregarPedidoEnvio(context, data);
    const { localizarClienteEnvioOmie } = await import("./mimo-omie-envio.server");
    return localizarClienteEnvioOmie(cfg, data.documento);
  });

export const enviarPedidoParaConferenciaOmieMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(envioSchema)
  .handler(async ({ context, data }) => {
    if (process.env.MIMO_OMIE_ENVIO_PEDIDO !== "ativo")
      throw Error("O envio de pedidos ao Omie ainda não está ativado.");
    const { exigirAtivacaoTira } = await import("./mimo-tira.server");
    exigirAtivacaoTira();
    const { cfg, pedido } = await carregarPedidoEnvio(context, data);
    const { hashOmie } = await import("./mimo-omie.server");
    const {
      conferirPedidoEnviadoOmie,
      incluirPedidoParaConferenciaOmie,
      localizarClienteEnvioOmie,
      resolverProdutosOmie,
    } = await import("./mimo-omie-envio.server");
    const [itens, cliente] = await Promise.all([
      resolverProdutosOmie(cfg, pedido.documento.itens, vinculosProdutos()),
      localizarClienteEnvioOmie(cfg, data.documento),
    ]);
    if (cliente.id !== data.clienteId)
      throw Error("O cadastro do cliente mudou. Consulte o CPF ou CNPJ novamente.");
    const pendentes = itens.filter((item) => !item.produto);
    if (pendentes.length)
      throw Error(
        `Confira os códigos de produto no Omie: ${pendentes.map((item) => item.codigo).join(", ")}.`,
      );
    if ((await hashOmie(itens)) !== data.versaoProdutos)
      throw Error("O cadastro dos produtos mudou. Reabra a janela para conferir os códigos.");
    const payload = montarInclusaoPedidoOmie(
      pedido,
      {
        ...data.fiscal,
        codigoCliente: cliente.id,
        produtosPorItem: Object.fromEntries(
          itens.flatMap((item) => (item.produto ? [[item.id, item.produto.id]] : [])),
        ),
      },
      data.dataPrevisao,
    );
    const [app, hash] = await Promise.all([
      hashOmie({ app: cfg.appKey, empresa: cfg.empresaId }),
      hashOmie(payload),
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = tiraClient(supabaseAdmin);
    async function registrarEnvio(confirmado?: {
      codigo: number;
      numero: string;
      assinatura: string;
    }) {
      const r = await db.rpc("mimo_omie_registrar_envio", {
        _empresa: cfg.empresaId,
        _ator: context.userId,
        _pedido: pedido.id,
        _versao: pedido.versao,
        _app: app,
        _hash_pedido: hash,
        ...(confirmado && {
          _codigo_omie: confirmado.codigo,
          _numero_omie: confirmado.numero,
          _assinatura: confirmado.assinatura,
        }),
      });
      if (r.error)
        throw Error(
          "Não foi possível registrar o envio. Confira o pedido anterior ou reabra a lista.",
        );
      return reservaSchema.parse(r.data);
    }
    const reserva = await registrarEnvio();
    if (reserva.codigo && reserva.numero) return { codigo: reserva.codigo, numero: reserva.numero };
    if (reserva.reservado) {
      // Falhas de rede podem ocorrer depois de o Omie salvar o pedido.
      await incluirPedidoParaConferenciaOmie(cfg, payload).catch(() => undefined);
    }
    const confirmado = await conferirPedidoEnviadoOmie(cfg, payload, pedido.total).catch(() => {
      throw Error(
        `Envio sem confirmação. Procure ${payload.cabecalho.codigo_pedido_integracao} no Omie. Repetir esta ação consulta o mesmo pedido.`,
      );
    });
    await registrarEnvio(confirmado);
    return { codigo: confirmado.codigo, numero: confirmado.numero };
  });
