import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cadastroFiscalSchema, montarInclusaoPedidoOmie } from "./mimo-omie-faturamento";
import { codigoOmieSchema } from "./mimo-omie";
import { pedidoSchema, type PedidoSalvo, type Recebimento } from "./mimo-pedido";
import { tiraClient } from "./mimo-pedido-db";

const operacaoSchema = z
  .object({
    id: z.string().uuid(),
    versao: z.number().int().positive(),
    dataPrevisao: z.string(),
    cadastro: cadastroFiscalSchema,
    confirmarTeste: z.literal(true),
  })
  .strict();

const reservaSchema = z.object({
  reservada: z.boolean(),
  estado: z.enum(["criando", "criado", "faturando", "solicitado"]).nullable(),
  codigoOmie: codigoOmieSchema.nullable(),
});

export const testarFaturamentoOmieMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(operacaoSchema)
  .handler(async ({ data, context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (acesso.papel !== "administrador" && acesso.papel !== "gestor")
      throw Error("Acesso negado.");
    const { configOmie, consultarPedidoOmie, hashOmie } = await import("./mimo-omie.server");
    const { configurarOmieTeste, incluirPedidoOmieTeste, solicitarFaturamentoOmieTeste } =
      await import("./mimo-omie-faturamento.server");
    const producao = configOmie();
    const teste = configurarOmieTeste();
    if (!teste || !producao || producao.empresaId !== acesso.empresaId)
      throw Error("Configuração de teste do Omie indisponível.");

    const atual = await tiraClient(context.supabase)
      .from("mimo_tira_pedidos_seguros")
      .select("*")
      .eq("empresa_id", acesso.empresaId)
      .eq("id", data.id)
      .eq("versao", data.versao)
      .single();
    if (atual.error || !atual.data) throw Error("Pedido indisponível ou alterado.");
    const documento = pedidoSchema.parse(atual.data.documento);
    const pedido: PedidoSalvo = {
      ...atual.data,
      documento,
      status: documento.status,
      pix: atual.data.pix as Recebimento,
      recebimentos: atual.data.recebimentos as Recebimento[],
    };
    const dados = [pedido, data.cadastro, data.dataPrevisao] as const;
    const payload = montarInclusaoPedidoOmie(...dados);
    const chaveApp = await hashOmie({ app: teste.OMIE_TESTE_APP_KEY, ambiente: "teste" });
    const hashPedido = await hashOmie(payload);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = tiraClient(supabaseAdmin);
    async function registrar(acao: string, codigo?: number) {
      const r = await db.rpc("mimo_omie_registrar_faturamento_teste", {
        _empresa: acesso.empresaId,
        _ator: context.userId,
        _pedido: data.id,
        _versao: data.versao,
        _app: chaveApp,
        _hash_pedido: hashPedido,
        _acao: acao,
        ...(codigo === undefined ? {} : { _codigo_omie: codigo }),
      });
      if (r.error)
        throw Error(
          "Não foi possível registrar a operação. Confira o Omie antes de tentar novamente.",
        );
      return reservaSchema.parse(r.data);
    }

    let operacao = await registrar("reservar_criacao");
    if (operacao.reservada) {
      const criado = await incluirPedidoOmieTeste(teste, [...dados]);
      operacao = await registrar("confirmar_criacao", criado.codigo_pedido);
    }
    if (!operacao.codigoOmie)
      throw Error(
        "Criação sem confirmação. Confira o código de integração no aplicativo de teste.",
      );
    const codigo = operacao.codigoOmie;
    if (operacao.estado === "solicitado") return { codigo, estado: "solicitado" as const };

    const remoto = await consultarPedidoOmie(
      {
        ...producao,
        appKey: teste.OMIE_TESTE_APP_KEY,
        secret: teste.OMIE_TESTE_APP_SECRET,
      },
      codigo,
    );
    const total = z.object({ valor_total_pedido: z.number() }).safeParse(remoto.total_pedido);
    const itensConferem =
      remoto.det.length === payload.det.length &&
      payload.det.every(({ ide, produto }) => {
        const item = remoto.det.find(
          (linha) => linha.ide.codigo_item_integracao === ide.codigo_item_integracao,
        );
        return (
          item &&
          Number(item.produto.codigo_produto) === produto.codigo_produto &&
          item.produto.quantidade === produto.quantidade
        );
      });
    if (
      remoto.cabecalho.codigo_pedido_integracao !== payload.cabecalho.codigo_pedido_integracao ||
      remoto.cabecalho.codigo_cliente !== data.cadastro.codigoCliente ||
      remoto.infoCadastro.cancelado !== "N" ||
      !itensConferem ||
      !total.success ||
      Math.round(total.data.valor_total_pedido * 100) !== pedido.total
    )
      throw Error(
        "Os dados da venda no Omie não conferem com o pedido do MiMo. Faturamento interrompido.",
      );

    if (operacao.estado === "faturando" && remoto.infoCadastro.faturado === "S") {
      await registrar("confirmar_solicitacao", codigo);
      return { codigo, estado: "solicitado" as const };
    }
    if (
      remoto.infoCadastro.faturado !== "N" ||
      !(await registrar("reservar_faturamento")).reservada
    ) {
      throw Error(
        "Faturamento já solicitado ou sem confirmação. Confira o pedido no aplicativo de teste do Omie.",
      );
    }
    await solicitarFaturamentoOmieTeste(teste, codigo);
    await registrar("confirmar_solicitacao", codigo);
    return { codigo, estado: "solicitado" as const };
  });
