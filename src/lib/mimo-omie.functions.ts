import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  alterarSomenteCfop,
  confirmarCfopSchema,
  consultarOmieSchema,
  prepararCfopSchema,
  type PreviaCfop,
} from "./mimo-omie";
import { omieDB } from "./mimo-omie-db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function acessoOmie(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { exigirMimo } = await import("./mimo-leads.server");
  const acesso = await exigirMimo(context.supabase, context.userId);
  if (!["administrador", "gestor"].includes(acesso.papel))
    throw Error("Acesso exclusivo à administração e gestão.");
  return acesso;
}
async function configuracao(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const acesso = await acessoOmie(context);
  const { configOmie } = await import("./mimo-omie.server");
  const cfg = configOmie();
  if (!cfg || cfg.empresaId !== acesso.empresaId)
    throw Error("Integração OMIE indisponível. Solicite a configuração à administração.");
  return { acesso, cfg };
}
export const statusOmieMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const acesso = await acessoOmie(context);
    const { configOmie } = await import("./mimo-omie.server");
    const cfg = configOmie();
    if (!cfg || cfg.empresaId !== acesso.empresaId)
      return {
        disponivel: false,
        mensagem: "Integração OMIE indisponível. Solicite a configuração à administração.",
      };
    const { error } = await omieDB(context.supabase)
      .from("mimo_omie_previas")
      .select("id")
      .eq("empresa_id", acesso.empresaId)
      .limit(1);
    return {
      disponivel: !error,
      mensagem: error
        ? "A auditoria da integração ainda não está disponível. Solicite a configuração à administração."
        : "Modo de simulação: nenhuma alteração será enviada ao OMIE.",
    };
  });

export const consultarOmieMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(consultarOmieSchema)
  .handler(async ({ context, data }) => {
    const { cfg } = await configuracao(context);
    const { consultarPedidoOmie, versaoOmie } = await import("./mimo-omie.server");
    const pedido = await consultarPedidoOmie(cfg, data.pedidoId);
    return {
      pedidoId: pedido.cabecalho.codigo_pedido,
      numero: pedido.cabecalho.numero_pedido ?? "",
      versao: await versaoOmie(cfg, pedido),
      editavel: pedido.infoCadastro.faturado === "N" && pedido.infoCadastro.cancelado === "N",
      itens: pedido.det.map((i) => ({
        itemId: i.ide.codigo_item,
        descricao: i.produto.descricao ?? "Item",
        cfop: i.produto.cfop,
      })),
    };
  });

export const prepararCfopMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(prepararCfopSchema)
  .handler(async ({ context, data }): Promise<PreviaCfop> => {
    const { acesso, cfg } = await configuracao(context);
    const { consultarPedidoOmie, versaoOmie } = await import("./mimo-omie.server");
    const pedido = await consultarPedidoOmie(cfg, data.pedidoId);
    const versao = await versaoOmie(cfg, pedido);
    if (versao !== data.versao)
      throw Error("O pedido mudou no OMIE. Consulte novamente antes de gerar a prévia.");
    const { mudancas } = alterarSomenteCfop(pedido, data.mudancas);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await omieDB(supabaseAdmin).rpc("mimo_omie_preparar", {
      p_empresa: acesso.empresaId,
      p_ator: context.userId,
      p_pedido: data.pedidoId,
      p_versao: versao,
      p_mudancas: mudancas,
    });
    if (error || !id)
      throw Error(
        "Não foi possível registrar a prévia na auditoria. Nenhuma alteração foi enviada.",
      );
    const { data: previa, error: leitura } = await omieDB(context.supabase)
      .from("mimo_omie_previas")
      .select("id,expira_em")
      .eq("empresa_id", acesso.empresaId)
      .eq("ator_id", context.userId)
      .eq("id", id)
      .single();
    if (leitura || !previa) throw Error("Prévia indisponível. Consulte o pedido novamente.");
    return { id: previa.id, pedidoId: data.pedidoId, expiraEm: previa.expira_em, mudancas };
  });

export const confirmarCfopMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(confirmarCfopSchema)
  .handler(async ({ context, data }) => {
    const { acesso, cfg } = await configuracao(context);
    const { data: previa, error } = await omieDB(context.supabase)
      .from("mimo_omie_previas")
      .select("*")
      .eq("empresa_id", acesso.empresaId)
      .eq("ator_id", context.userId)
      .eq("id", data.previaId)
      .single();
    if (error || !previa) throw Error("Prévia indisponível.");
    if (previa.estado === "simulada") return { estado: "simulada" as const };
    if (previa.estado !== "previa")
      throw Error("Esta prévia não pode mais ser confirmada. Consulte novamente.");
    const { consultarPedidoOmie, versaoOmie } = await import("./mimo-omie.server");
    // Compare the full document, including taxes, and the configured app/enterprise.
    const pedido = await consultarPedidoOmie(cfg, previa.pedido_id);
    const versao = await versaoOmie(cfg, pedido);
    if (versao === previa.versao)
      alterarSomenteCfop(
        pedido,
        previa.mudancas.map((i) => ({ itemId: i.itemId, cfop: i.novo })),
      );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: estado, error: gravacao } = await omieDB(supabaseAdmin).rpc(
      "mimo_omie_confirmar",
      {
        p_empresa: acesso.empresaId,
        p_ator: context.userId,
        p_id: previa.id,
        p_versao: versao,
      },
    );
    if (gravacao)
      throw Error(
        "Não foi possível registrar a confirmação. Nenhuma alteração foi enviada ao OMIE.",
      );
    if (estado !== "simulada")
      throw Error("A prévia expirou ou o pedido mudou. Consulte novamente antes de continuar.");
    // Deliberately no AlterarPedidoVenda call. Simulation cannot write remotely.
    return { estado: "simulada" as const };
  });
