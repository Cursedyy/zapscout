import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { idNuvemSchema } from "./mimo-carrinhos";
type DB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      mimo_recuperacao_indicadores: { Args: { _empresa: string; _ator: string }; Returns: Json };
      mimo_recuperacao_pausar: { Args: { _empresa: string; _ator: string }; Returns: undefined };
      mimo_recuperacao_configurar: {
        Args: { _empresa: string; _loja: string; _vinculo: string; _ator: string; _ativo: boolean };
        Returns: undefined;
      };
    };
  };
};
const indicadores = z.object({
  ativa: z.boolean(),
  inicioEm: z.string().nullable(),
  pendentes: z.number().int().nonnegative(),
  enviadas: z.number().int().nonnegative(),
  incertas: z.number().int().nonnegative(),
  bloqueadas: z.number().int().nonnegative(),
  compras: z.number().int().nonnegative(),
  valorCentavos: z.string().regex(/^\d+$/),
});
async function acesso(c: { supabase: SupabaseClient<Database>; userId: string }) {
  const { exigirMimo } = await import("./mimo-leads.server");
  const a = await exigirMimo(c.supabase, c.userId);
  if (!["administrador", "gestor"].includes(a.papel))
    throw Error("Acesso exclusivo à administração e gestão.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { ...a, db: supabaseAdmin as unknown as SupabaseClient<DB> };
}
export const enviarLembreteManualMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ checkout: idNuvemSchema }).parse(v))
  .handler(async ({ context, data }) => {
    const a = await acesso(context);
    const { executarRecuperacaoMimo } = await import("./mimo-recuperacao-worker.server");
    try {
      const resultado = await executarRecuperacaoMimo({
        empresa: a.empresaId,
        ator: context.userId,
        checkout: data.checkout,
      });
      return { resultado };
    } catch {
      // Nunca repetir automaticamente: a reserva pode já ter sido autorizada.
      throw Error(
        "Não foi possível concluir o envio. Atualize o carrinho para verificar o estado antes de qualquer nova tentativa.",
      );
    }
  });
export const obterIndicadoresRecuperacaoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await acesso(context);
    const r = await a.db.rpc("mimo_recuperacao_indicadores", {
      _empresa: a.empresaId,
      _ator: context.userId,
    });
    if (r.error) {
      if (["PGRST202", "42883"].includes(r.error.code)) return null;
      throw Error("Não foi possível consultar a recuperação de carrinhos.");
    }
    return indicadores.parse(r.data);
  });
export const obterRemetentesRecuperacaoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await acesso(context);
    const { remetentesRecuperacao } = await import("./mimo-recuperacao-remetente.server");
    return remetentesRecuperacao(a.db, a.empresaId);
  });
export const configurarRecuperacaoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ ativo: z.boolean(), vinculoId: z.string().uuid().optional() }).parse(v),
  )
  .handler(async ({ context, data }) => {
    const a = await acesso(context);
    if (!data.ativo && !data.vinculoId) {
      const p = await a.db.rpc("mimo_recuperacao_pausar", {
        _empresa: a.empresaId,
        _ator: context.userId,
      });
      if (p.error) throw Error("Não foi possível pausar os lembretes.");
      return { ativo: false };
    }
    const { configOAuthNuvem, obterConfigNuvem } = await import("./mimo-nuvemshop-oauth.server");
    const cfg = configOAuthNuvem();
    if (!cfg || cfg.empresa !== a.empresaId) throw Error("A loja precisa ser configurada.");
    const { remetentesRecuperacao, tokenRemetenteRecuperacao } =
      await import("./mimo-recuperacao-remetente.server");
    const opcoes = await remetentesRecuperacao(a.db, a.empresaId);
    const id = data.vinculoId ?? opcoes.selecionado;
    if (!id) throw Error("Selecione o número da recuperação de carrinhos.");
    await tokenRemetenteRecuperacao(a.db, a.empresaId, id);
    if (data.ativo) {
      const loja = await obterConfigNuvem(a.empresaId, context.userId);
      if (!loja || loja.loja !== cfg.loja) throw Error("Reautorize a loja antes de ativar.");
    }
    const r = await a.db.rpc("mimo_recuperacao_configurar", {
      _empresa: a.empresaId,
      _loja: cfg.loja,
      _vinculo: id,
      _ator: context.userId,
      _ativo: data.ativo,
    });
    if (r.error) throw Error("Não foi possível alterar a ativação da recuperação.");
    return { ativo: data.ativo };
  });
