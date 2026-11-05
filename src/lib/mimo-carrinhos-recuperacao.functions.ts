import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
export const configurarRecuperacaoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ ativo: z.boolean() }).parse(v))
  .handler(async ({ context, data }) => {
    const a = await acesso(context);
    if (!data.ativo) {
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
    const v = await a.db
      .from("mimo_whatsapp_vinculos")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .eq("ativo", true)
      .single();
    if (v.error || !v.data) throw Error("Confirme um único número comercial em WhatsApp MiMo.");
    if (data.ativo) {
      const loja = await obterConfigNuvem(a.empresaId, context.userId);
      if (!loja || loja.loja !== cfg.loja) throw Error("Reautorize a loja antes de ativar.");
      const p = await a.db
        .from("profiles")
        .select("uazapi_instance_token")
        .eq("id", v.data.owner_id)
        .single();
      const token = p.data?.uazapi_instance_token;
      const { uazStatus } = await import("./uazapi.server");
      const { hashTokenMimo, numeroConectadoMimo } = await import("./mimo-whatsapp");
      if (p.error || !token || (await hashTokenMimo(token)) !== v.data.token_sha256)
        throw Error("A conexão comercial precisa ser confirmada novamente.");
      const s = await uazStatus(token);
      if (
        s.status !== "connected" ||
        numeroConectadoMimo(s.profileNumber) !== numeroConectadoMimo(v.data.numero_comercial)
      )
        throw Error("O WhatsApp comercial precisa estar conectado.");
    }
    const r = await a.db.rpc("mimo_recuperacao_configurar", {
      _empresa: a.empresaId,
      _loja: cfg.loja,
      _vinculo: v.data.id,
      _ator: context.userId,
      _ativo: data.ativo,
    });
    if (r.error) throw Error("Não foi possível alterar a ativação da recuperação.");
    return { ativo: data.ativo };
  });
