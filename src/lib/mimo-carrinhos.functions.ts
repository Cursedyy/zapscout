import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { diagnosticoCarrinhoSchema } from "./mimo-carrinhos-diagnostico";
import {
  canaisCarrinho,
  linkCarrinhoSeguro,
  situacaoCarrinho,
  type CarrinhoRegistro,
  type PedidoNuvemRegistro,
} from "./mimo-carrinhos";
type Table<T> = { Row: T; Insert: never; Update: never; Relationships: [] };
type Loja = {
  empresa_id: string;
  loja_id: string;
  sincronizado_em: string;
  sincronizado_por: string;
};
type DB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      mimo_nuvem_lojas: Table<Loja>;
      mimo_nuvem_carrinhos: Table<CarrinhoRegistro & { empresa_id: string; loja_id: string }>;
      mimo_nuvem_pedidos: Table<PedidoNuvemRegistro & { empresa_id: string; loja_id: string }>;
    };
    Functions: Database["public"]["Functions"] & {
      mimo_recuperacao_diagnostico: {
        Args: { _empresa: string; _ator: string; _checkouts: string[] };
        Returns: Json;
      };
      mimo_nuvem_sincronizar: {
        Args: { _empresa: string; _loja: string; _ator: string; _carrinhos: Json; _pedidos: Json };
        Returns: undefined;
      };
    };
  };
};
const client = (db: SupabaseClient<Database>) => db as unknown as SupabaseClient<DB>;
async function acesso(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { exigirMimo } = await import("./mimo-leads.server");
  const a = await exigirMimo(context.supabase, context.userId);
  if (!["administrador", "gestor"].includes(a.papel))
    throw Error("Acesso exclusivo à administração e gestão.");
  return { ...a, db: client(context.supabase) };
}
export const listarCarrinhosMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ pagina: z.number().int().min(0).max(100000).default(0) }).parse(v))
  .handler(async ({ context, data }) => {
    const a = await acesso(context);
    const { obterConfigNuvem, configOAuthNuvem } = await import("./mimo-nuvemshop-oauth.server");
    const cfg = await obterConfigNuvem(a.empresaId, context.userId);
    const oauth = configOAuthNuvem();
    const podeConectar = !!oauth && oauth.empresa === a.empresaId;
    const configurada = !!cfg && cfg.empresa === a.empresaId;
    const loja = await a.db
      .from("mimo_nuvem_lojas")
      .select("loja_id,sincronizado_em")
      .eq("empresa_id", a.empresaId)
      .maybeSingle();
    if (loja.error) {
      if (["42P01", "PGRST205"].includes(loja.error.code))
        return {
          disponivel: false,
          configurada,
          podeConectar,
          sincronizadoEm: null,
          carrinhos: [],
          total: 0,
        };
      throw Error("Não foi possível carregar a conexão da loja.");
    }
    const r = await a.db
      .from("mimo_nuvem_carrinhos")
      .select("*", { count: "exact" })
      .eq("empresa_id", a.empresaId)
      .order("origem_updated_at", { ascending: false })
      .order("checkout_id")
      .range(data.pagina * 30, data.pagina * 30 + 29);
    if (r.error) throw Error("Não foi possível carregar os carrinhos.");
    const hashes = (r.data ?? []).map((c) => c.token_hash);
    const pedidos =
      hashes.length && loja.data
        ? await a.db
            .from("mimo_nuvem_pedidos")
            .select("*")
            .eq("empresa_id", a.empresaId)
            .eq("loja_id", loja.data.loja_id)
            .in("token_hash", hashes)
        : { data: [], error: null };
    if (pedidos.error) throw Error("Não foi possível verificar os pedidos associados.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const diagnostico = await client(supabaseAdmin).rpc("mimo_recuperacao_diagnostico", {
      _empresa: a.empresaId,
      _ator: context.userId,
      _checkouts: (r.data ?? []).map((c) => c.checkout_id),
    });
    if (diagnostico.error && !["PGRST202", "42883"].includes(diagnostico.error.code))
      throw Error("Não foi possível verificar o estado dos lembretes.");
    const estados = diagnostico.error
      ? []
      : z.array(diagnosticoCarrinhoSchema).parse(diagnostico.data);
    const { rpcEmail, ErroEmailRpc } = await import("./mimo-email-db.server");
    let estadosEmail: z.infer<typeof diagnosticoCarrinhoSchema>[] = [];
    try {
      estadosEmail = z.array(diagnosticoCarrinhoSchema).parse(
        await rpcEmail("mimo_email_diagnostico", {
          _empresa: a.empresaId,
          _ator: context.userId,
          _checkouts: (r.data ?? []).map((c) => c.checkout_id),
        }),
      );
    } catch (e) {
      if (!(e instanceof ErroEmailRpc) || !["PGRST202", "42883"].includes(e.codigo))
        throw Error("Não foi possível verificar os lembretes por e-mail.");
    }
    return {
      disponivel: true,
      podeConectar,
      configurada: configurada && (!loja.data || loja.data.loja_id === cfg?.loja),
      sincronizadoEm: loja.data?.sincronizado_em ?? null,
      total: r.count ?? 0,
      carrinhos: (r.data ?? []).map((c) => {
        const p = pedidos.data?.find(
          (p) => p.loja_id === c.loja_id && p.token_hash === c.token_hash,
        );
        return {
          id: c.checkout_id,
          recuperacao: estados.find((d) => d.id === c.checkout_id) ?? null,
          emailRecuperacao: estadosEmail.find((d) => d.id === c.checkout_id) ?? null,
          nome: c.nome,
          email: c.email,
          telefone: c.telefone,
          total: c.total,
          moeda: c.moeda,
          itens: c.itens,
          atualizadoEm: c.origem_updated_at,
          canais: canaisCarrinho(c),
          situacao: situacaoCarrinho(c, p),
          url:
            !p && cfg?.empresa === a.empresaId && cfg.loja === c.loja_id
              ? linkCarrinhoSeguro(c.url, cfg.hosts)
              : null,
          pedido: p ? { numero: p.numero, total: p.total, moeda: p.moeda } : null,
        };
      }),
    };
  });
export const sincronizarCarrinhosMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await acesso(context);
    const { coletarNuvem } = await import("./mimo-nuvemshop.server");
    const { obterConfigNuvem } = await import("./mimo-nuvemshop-oauth.server");
    const cfg = await obterConfigNuvem(a.empresaId, context.userId);
    if (!cfg || cfg.empresa !== a.empresaId)
      throw Error("A conexão da Nuvemshop ainda não foi configurada.");
    const lote = await coletarNuvem(cfg);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await client(supabaseAdmin).rpc("mimo_nuvem_sincronizar", {
      _empresa: a.empresaId,
      _loja: cfg.loja,
      _ator: context.userId,
      _carrinhos: lote.carrinhos as unknown as Json,
      _pedidos: lote.pedidos as unknown as Json,
    });
    if (r.error)
      throw Error("Não foi possível gravar a sincronização. Confira a conexão e seu acesso.");
    return { carrinhos: lote.carrinhos.length, pedidos: lote.pedidos.length };
  });
