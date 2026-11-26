import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { codigoOmieSchema } from "./mimo-omie";
import { tiraClient } from "./mimo-pedido-db";
import { opcoesStatus } from "./mimo-tira-regras";
import type { Contexto } from "./mimo-omie-envio.functions";

const pedidoSchema = z
  .object({ id: z.string().uuid(), versao: z.number().int().positive() })
  .strict();
const vinculoSchema = z
  .object({
    codigo: codigoOmieSchema,
    numero: z.string(),
    assinatura: z.string().regex(/^[a-f0-9]{64}$/),
    reservada: z.boolean(),
    pendente: z.boolean(),
    nfe: z.string().nullable(),
  })
  .nullable();

function faturamentoAtivo() {
  return process.env.MIMO_OMIE_FATURAMENTO === "ativo";
}

async function prepararAcesso(contexto: Contexto, dados: z.infer<typeof pedidoSchema>) {
  const { exigirMimo } = await import("./mimo-leads.server");
  const acesso = await exigirMimo(contexto.supabase, contexto.userId);
  if (!opcoesStatus(acesso.papel, "confirmado").includes("faturado")) throw Error("Acesso negado.");
  const { configOmie, hashOmie } = await import("./mimo-omie.server");
  const cfg = configOmie();
  if (!cfg || cfg.empresaId !== acesso.empresaId)
    throw Error("O Omie não está configurado para a MiMo.");
  const { data: pedido, error } = await tiraClient(contexto.supabase)
    .from("mimo_tira_pedidos_seguros")
    .select("id,numero")
    .eq("empresa_id", acesso.empresaId)
    .eq("id", dados.id)
    .maybeSingle();
  if (error || !pedido) throw Error("Pedido indisponível. Reabra a lista.");
  const pedidoId = pedido.id;
  const chaveApp = await hashOmie({ app: cfg.appKey, empresa: cfg.empresaId });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = tiraClient(supabaseAdmin);
  async function registrarFiscal(
    acao: "consultar" | "reservar" | "confirmar",
    assinatura?: string,
    nfe?: { chave: string; numero: string; data: string },
  ) {
    const r = await db.rpc("mimo_omie_operar_nfe", {
      _empresa: acesso.empresaId,
      _ator: contexto.userId,
      _pedido: pedidoId,
      _versao: dados.versao,
      _app: chaveApp,
      _acao: acao,
      ...(assinatura && { _assinatura: assinatura }),
      ...(nfe && { _chave: nfe.chave, _numero: nfe.numero, _data: nfe.data }),
    });
    if (r.error)
      throw Error("Verifique o vínculo e a versão do pedido antes de atualizar o faturamento.");
    return vinculoSchema.parse(r.data);
  }
  return { cfg, integracao: `MIMO-${pedido.numero}`, registrarFiscal };
}

export const consultarFaturamentoOmieMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(pedidoSchema)
  .handler(async ({ context, data }) => {
    const ativo = faturamentoAtivo();
    if (!ativo && process.env.MIMO_OMIE_ENVIO_PEDIDO !== "ativo")
      return { estado: "desativado" as const };
    const { registrarFiscal } = await prepararAcesso(context, data);
    const vinculo = await registrarFiscal("consultar");
    if (!vinculo) return { estado: "sem_vinculo" as const };
    if (vinculo.nfe) return { estado: "autorizado" as const, nota: vinculo.nfe };
    return {
      estado: "vinculado" as const,
      numero: vinculo.numero,
      pendente: vinculo.pendente,
      ativo,
    };
  });

export const operarFaturamentoOmieMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(pedidoSchema.extend({ emitir: z.boolean() }))
  .handler(async ({ context, data }) => {
    if (data.emitir && !faturamentoAtivo())
      throw Error("A emissão pelo painel ainda não está ativada.");
    const { exigirAtivacaoTira } = await import("./mimo-tira.server");
    exigirAtivacaoTira();
    const { cfg, integracao, registrarFiscal } = await prepararAcesso(context, data);
    const vinculo = await registrarFiscal("consultar");
    if (!vinculo) throw Error("Envie o pedido ao Omie antes de solicitar o faturamento.");
    if (vinculo.nfe) return { estado: "autorizado" as const, nota: vinculo.nfe };
    const {
      consultarAutorizacaoOmie,
      conferirDadosFiscaisOmie,
      validarEmissaoOmie,
      solicitarEmissaoOmie,
    } = await import("./mimo-omie-producao.server");
    const pedido = { codigo: vinculo.codigo, integracao, assinatura: vinculo.assinatura };
    type Situacao = Awaited<ReturnType<typeof consultarAutorizacaoOmie>>;
    async function confirmar(situacao: Extract<Situacao, { estado: "autorizado" }>) {
      await conferirDadosFiscaisOmie(cfg, pedido);
      const gravado = await registrarFiscal("confirmar", pedido.assinatura, situacao.nfe);
      if (!gravado?.nfe)
        throw Error(
          "A NF-e foi localizada. A confirmação no painel deve ser consultada novamente.",
        );
      return { estado: "autorizado" as const, nota: gravado.nfe };
    }
    const situacao = await consultarAutorizacaoOmie(cfg, pedido).catch(() => {
      throw Error("Não foi possível consultar a situação fiscal do pedido no Omie.");
    });
    if (situacao.estado === "autorizado") return confirmar(situacao);
    if (situacao.estado === "cancelado" || situacao.estado === "denegado") return situacao;
    if (situacao.estado === "aguardando" || vinculo.pendente)
      return { estado: "aguardando" as const };
    if (!data.emitir) return { estado: "aberto" as const };
    if (!situacao.producao)
      throw Error("O pedido no Omie está fora do ambiente de emissão de produção.");
    await validarEmissaoOmie(cfg, pedido);
    const reserva = await registrarFiscal("reservar", pedido.assinatura);
    if (!reserva?.reservada) return { estado: "aguardando" as const };
    // Uma falha de transporte pode acontecer depois que o Omie recebeu o pedido.
    await solicitarEmissaoOmie(cfg, pedido.codigo).catch(() => undefined);
    const depois = await consultarAutorizacaoOmie(cfg, pedido).catch(() => null);
    if (depois?.estado === "autorizado") return confirmar(depois);
    if (depois?.estado === "cancelado" || depois?.estado === "denegado") return depois;
    return { estado: "aguardando" as const };
  });
