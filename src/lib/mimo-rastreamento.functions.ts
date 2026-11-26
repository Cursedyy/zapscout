import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pedidoSchema, type PedidoSalvo, type Recebimento } from "./mimo-pedido";
import { tiraClient } from "./mimo-pedido-db";
import { filtrarEntregas, filtroRastreamentoSchema, STATUS_ENTREGA } from "./mimo-rastreamento";
import type { Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const TAMANHO_LOTE = 500;
const LIMITE_SEGURO = 20_000;

type LinhaPedido = {
  id: string;
  empresa_id: string;
  lead_id: string;
  numero: number;
  versao: number;
  documento: Json;
  pix: Json;
  recebimentos: Json;
  total: number;
  produtos: number;
  frete: number;
  status: string;
  created_at: string;
  updated_at: string;
};

function mapear(linha: LinhaPedido): PedidoSalvo {
  const documento = pedidoSchema.parse(linha.documento);
  return {
    ...linha,
    documento,
    status: documento.status,
    pix: linha.pix as Recebimento,
    recebimentos: linha.recebimentos as Recebimento[],
  } as PedidoSalvo;
}

export const listarRastreamentoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((valor) => filtroRastreamentoSchema.parse(valor))
  .handler(async ({ data, context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (acesso.papel === "marketing" || acesso.papel === "lider_marketing")
      throw new Error("Acesso negado.");
    const { tiraPersistenciaAtiva } = await import("./mimo-tira.server");
    if (!tiraPersistenciaAtiva()) return { disponivel: false, itens: [], total: 0, frenet: null };

    const db = tiraClient(context.supabase);
    const pedidos: PedidoSalvo[] = [];
    for (let inicio = 0; inicio < LIMITE_SEGURO; inicio += TAMANHO_LOTE) {
      let consulta = db
        .from("mimo_tira_pedidos_seguros")
        .select("*")
        .eq("empresa_id", acesso.empresaId)
        .in("status", data.status ? [data.status] : ["faturado", "enviado", "entregue"]);
      if (data.inicio) consulta = consulta.gte("updated_at", `${data.inicio}T00:00:00-03:00`);
      if (data.fim) consulta = consulta.lte("updated_at", `${data.fim}T23:59:59.999-03:00`);
      const resposta = await consulta
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(inicio, inicio + TAMANHO_LOTE - 1);
      if (resposta.error) throw new Error("Não foi possível carregar as entregas.");
      const lote = (resposta.data ?? []) as LinhaPedido[];
      pedidos.push(...lote.map(mapear));
      if (lote.length < TAMANHO_LOTE) break;
      if (inicio + TAMANHO_LOTE >= LIMITE_SEGURO) {
        throw new Error("Há muitas entregas para uma consulta segura. Reduza o período.");
      }
    }

    const encontradas = filtrarEntregas(pedidos, data.busca);
    const de = (data.pagina - 1) * data.porPagina;
    const { tokenRastreamentoFrenet } = await import("./mimo-frenet-rastreamento.server");
    return {
      disponivel: true,
      itens: encontradas.slice(de, de + data.porPagina),
      total: encontradas.length,
      frenet: tokenRastreamentoFrenet() ? { podeVincular: podeVincular(acesso.papel) } : null,
    };
  });

const pedidoId = z.string().uuid();
const codigo = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{0,79}$/);
const servico = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const identificacao = z.object({ codigo, servico }).strict();

function podeVincular(papel: string) {
  return ["administrador", "gestor", "administrativo"].includes(papel);
}

async function acessoRastreio(
  context: { supabase: SupabaseClient<Database>; userId: string },
  id: string,
  editar = false,
) {
  const { exigirMimo } = await import("./mimo-leads.server");
  const acesso = await exigirMimo(context.supabase, context.userId);
  if (!podeVincular(acesso.papel) && (editar || acesso.papel !== "vendedor")) {
    throw Error("Acesso negado.");
  }
  const { exigirAtivacaoTira } = await import("./mimo-tira.server");
  exigirAtivacaoTira();
  const db = tiraClient(context.supabase);
  const pedido = await db
    .from("mimo_tira_pedidos_seguros")
    .select("id")
    .eq("empresa_id", acesso.empresaId)
    .eq("id", id)
    .in("status", STATUS_ENTREGA)
    .maybeSingle();
  if (pedido.error || !pedido.data) throw Error("Pedido indisponível.");
  const { bancoRastreamentoFrenet } = await import("./mimo-frenet-rastreamento.server");
  return { empresaId: acesso.empresaId, db: bancoRastreamentoFrenet(context.supabase) };
}

function mensagemCadastro(error: { code: string }) {
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code)) {
    return "O cadastro de rastreios Frenet ainda não foi ativado no banco.";
  }
  if (error.code === "23505")
    return "Esse código já está vinculado. Confira os rastreios cadastrados.";
  if (error.code === "40001") return "O cadastro foi alterado. Reabra antes de editar.";
  if (error.code === "23514")
    return "Não foi possível salvar. Confira o código e o limite de 100 rastreios por pedido.";
  return "Não foi possível acessar o cadastro de rastreios.";
}

export const listarRemessasFrenetMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((valor) => z.object({ pedidoId }).strict().parse(valor))
  .handler(async ({ context, data }) => {
    const { db, empresaId } = await acessoRastreio(context, data.pedidoId);
    const r = await db
      .from("mimo_frenet_remessas")
      .select("codigo,servico")
      .eq("empresa_id", empresaId)
      .eq("pedido_id", data.pedidoId)
      .order("codigo");
    if (r.error) throw Error(mensagemCadastro(r.error));
    return r.data;
  });

export const vincularRemessaFrenetMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((valor) =>
    identificacao
      .extend({
        pedidoId,
        anterior: identificacao.nullable(),
      })
      .strict()
      .parse(valor),
  )
  .handler(async ({ context, data }) => {
    const { empresaId } = await acessoRastreio(context, data.pedidoId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { bancoRastreamentoFrenet } = await import("./mimo-frenet-rastreamento.server");
    const r = await bancoRastreamentoFrenet(supabaseAdmin).rpc("mimo_frenet_vincular_remessa", {
      _empresa: empresaId,
      _ator: context.userId,
      _pedido: data.pedidoId,
      _codigo: data.codigo,
      _servico: data.servico,
      _codigo_anterior: data.anterior?.codigo ?? null,
      _servico_anterior: data.anterior?.servico ?? null,
    });
    if (r.error) throw Error(mensagemCadastro(r.error));
    return { salvo: true };
  });

export const consultarRemessaFrenetMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((valor) => z.object({ pedidoId, codigo }).strict().parse(valor))
  .handler(async ({ context, data }) => {
    const { db, empresaId } = await acessoRastreio(context, data.pedidoId);
    const r = await db
      .from("mimo_frenet_remessas")
      .select("codigo,servico")
      .eq("empresa_id", empresaId)
      .eq("pedido_id", data.pedidoId)
      .eq("codigo", data.codigo)
      .maybeSingle();
    if (r.error) throw Error(mensagemCadastro(r.error));
    if (!r.data) throw Error("Código de rastreio indisponível para este pedido.");
    const { tokenRastreamentoFrenet, consultarEventosFrenet } =
      await import("./mimo-frenet-rastreamento.server");
    const token = tokenRastreamentoFrenet();
    if (!token) throw Error("A conexão de rastreio com a Frenet está indisponível.");
    return consultarEventosFrenet(r.data.codigo, r.data.servico, token);
  });
