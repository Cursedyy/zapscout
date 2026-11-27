import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  STATUS_FATURADOS,
  calcularDesempenho,
  clienteRepresentanteSchema,
  importacaoRepresentantesSchema,
  periodoRepresentantesSchema,
  podeGerenciarRepresentantesComerciais,
  representanteComercialSchema,
  type ClienteRepresentante,
  type HistoricoRepresentanteComercial,
  type PedidoFaturadoRep,
  type RepresentanteComercial,
  type TerritorioRepresentante,
  type UnidadeCarteiraRep,
} from "./mimo-representantes-comerciais";

type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
type Rpc = { Args: { _empresa: string; _dados: Json }; Returns: Json };
type RepDB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      mimo_rep_comerciais: Table<RepresentanteComercial>;
      mimo_rep_comerciais_territorios: Table<TerritorioRepresentante>;
      mimo_rep_comerciais_clientes: Table<ClienteRepresentante>;
      mimo_rep_comerciais_historico: Table<HistoricoRepresentanteComercial>;
    };
    Functions: Database["public"]["Functions"] & {
      mimo_rep_comercial_salvar: Rpc;
      mimo_rep_comerciais_importar: Rpc;
      mimo_rep_comercial_cliente: Rpc;
    };
  };
};
const repDb = (c: unknown) => c as SupabaseClient<RepDB>;

const LIMITE = 20000;
const PAGINA = 1000;

/** Lê todas as páginas; recusa resultado incompleto ou acima do limite. */
async function paginar<T>(
  ler: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  erro: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let n = 0; ; n += PAGINA) {
    const { data, error } = await ler(n, n + PAGINA - 1);
    if (error || !data) erroRpc(error as { message?: string; code?: string } | null, erro);
    out.push(...data);
    if (out.length > LIMITE) throw Error(`${erro} Mais de ${LIMITE} registros; reduza o período.`);
    if (data.length < PAGINA) return out;
  }
}

/** Erro do banco antes da migração ser aplicada: mensagem clara em vez de falha genérica. */
function semTabela(e: unknown) {
  const code = (e as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205" || code === "42883" || code === "PGRST202";
}

async function exigirGestao(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { exigirMimo } = await import("./mimo-leads.server");
  const a = await exigirMimo(context.supabase, context.userId);
  if (!podeGerenciarRepresentantesComerciais(a.papel)) throw Error("Acesso negado.");
  return a;
}

/** Mensagens das RPCs (sem acento no SQL) apresentadas ao usuário. */
function erroRpc(e: { message?: string; code?: string } | null, padrao: string): never {
  if (semTabela(e))
    throw Error(
      "Representantes comerciais ainda não estão habilitados no banco (migração pendente).",
    );
  const m = e?.message ?? "";
  const conhecidas: [RegExp, string][] = [
    [/Acesso negado/, "Acesso negado."],
    [/alterad[oa] por outra pessoa/, "O cadastro mudou. Atualize e reabra antes de salvar."],
    [/Ja existe representante/, "Já existe representante com este nome."],
    [
      /UF (\w\w) ja tem representante principal \((.*)\)/,
      "UF $1 já tem representante principal ($2). Torne-o secundário antes.",
    ],
    [/mais de um principal/, "Uma UF tem mais de um representante principal."],
    [/inativo/, "Representante indisponível ou inativo."],
    [/ja segue o representante da UF/, "O cliente já segue o representante da UF."],
    [/Unidade indisponivel/, "Unidade da carteira indisponível."],
    [/motivo/, "Informe o motivo da alteração."],
  ];
  for (const [re, msg] of conhecidas) {
    const r = re.exec(m);
    if (r) throw Error(msg.replace("$1", r[1] ?? "").replace("$2", r[2] ?? ""));
  }
  throw Error(padrao);
}

async function carregarBase(supabase: SupabaseClient<Database>, empresaId: string) {
  const db = repDb(supabase);
  const [reps, territorios, clientes] = await Promise.all([
    db
      .from("mimo_rep_comerciais")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("nome")
      .limit(1000),
    db
      .from("mimo_rep_comerciais_territorios")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("uf")
      .limit(5000),
    paginar(
      (de, ate) =>
        db
          .from("mimo_rep_comerciais_clientes")
          .select("*")
          .eq("empresa_id", empresaId)
          .order("unidade_id")
          .range(de, ate),
      "Não foi possível carregar as atribuições.",
    ),
  ]);
  for (const r of [reps, territorios])
    if (r.error) erroRpc(r.error, "Não foi possível carregar os representantes.");
  const unidades = await paginar<UnidadeCarteiraRep>(
    (de, ate) =>
      supabase
        .from("mimo_carteira_unidades")
        .select("id,nome,cidade,uf")
        .eq("empresa_id", empresaId)
        .order("id")
        .range(de, ate),
    "Não foi possível carregar a carteira.",
  );
  return {
    representantes: reps.data ?? [],
    territorios: territorios.data ?? [],
    clientes,
    unidades,
  };
}

export const carregarRepresentantesComerciais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await exigirGestao(context);
    return carregarBase(context.supabase, a.empresaId);
  });

export const desempenhoRepresentantesComerciais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => periodoRepresentantesSchema.parse(v))
  .handler(async ({ context, data }) => {
    const a = await exigirGestao(context);
    const base = await carregarBase(context.supabase, a.empresaId);
    const negociacoes = await paginar<{ unidade_id: string; lead_id: string }>(
      (de, ate) =>
        context.supabase
          .from("mimo_carteira_negociacoes")
          .select("unidade_id,lead_id")
          .eq("empresa_id", a.empresaId)
          .order("unidade_id")
          .order("lead_id")
          .range(de, ate),
      "Não foi possível carregar as negociações.",
    );
    const { tiraClient } = await import("./mimo-pedido-db");
    // Fonte canônica de pedidos (visão segura); período pela data de faturamento registrada.
    const brutos = await paginar(
      (de, ate) =>
        tiraClient(context.supabase)
          .from("mimo_tira_pedidos_seguros")
          .select("id,lead_id,status,total,faturado_em:documento->pagamento->>faturadoEm")
          .eq("empresa_id", a.empresaId)
          .in("status", [...STATUS_FATURADOS])
          .gte("documento->pagamento->>faturadoEm", data.de)
          .lte("documento->pagamento->>faturadoEm", data.ate)
          .order("id")
          .range(de, ate),
      "Não foi possível carregar os pedidos.",
    );
    const pedidos: PedidoFaturadoRep[] = (brutos as unknown as Record<string, unknown>[]).map(
      (p) => {
        const total = Number(p.total);
        if (!Number.isSafeInteger(total) || total < 0) throw Error("Pedido com total inválido.");
        return {
          id: String(p.id),
          lead_id: String(p.lead_id),
          status: String(p.status),
          total,
          faturado_em: typeof p.faturado_em === "string" ? p.faturado_em : null,
        };
      },
    );
    return { periodo: data, ...calcularDesempenho({ ...base, negociacoes, pedidos }) };
  });

export const salvarRepresentanteComercial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => representanteComercialSchema.parse(v))
  .handler(async ({ context, data }) => {
    const a = await exigirGestao(context);
    const r = await repDb(context.supabase).rpc("mimo_rep_comercial_salvar", {
      _empresa: a.empresaId,
      _dados: data as unknown as Json,
    });
    if (r.error) erroRpc(r.error, "Não foi possível salvar o representante.");
    return r.data as unknown as RepresentanteComercial;
  });

export const importarRepresentantesComerciais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => importacaoRepresentantesSchema.parse(v))
  .handler(async ({ context, data }) => {
    const a = await exigirGestao(context);
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const r = await repDb(context.supabase).rpc("mimo_rep_comerciais_importar", {
      _empresa: a.empresaId,
      _dados: { ...data, hash } as unknown as Json,
    });
    if (r.error) erroRpc(r.error, "Não foi possível importar a planilha.");
    return r.data as {
      criados: number;
      atualizados: number;
      inalterados: number;
      territorios: number;
    };
  });

export const atribuirClienteRepresentante = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => clienteRepresentanteSchema.parse(v))
  .handler(async ({ context, data }) => {
    const a = await exigirGestao(context);
    const r = await repDb(context.supabase).rpc("mimo_rep_comercial_cliente", {
      _empresa: a.empresaId,
      _dados: data as unknown as Json,
    });
    if (r.error) erroRpc(r.error, "Não foi possível alterar o representante do cliente.");
    return r.data as unknown as ClienteRepresentante;
  });

export const historicoRepresentantesComerciais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        entidade: z.enum(["representante", "territorio", "cliente", "importacao"]),
        referencia: z.string().min(1).max(64),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const a = await exigirGestao(context);
    const r = await repDb(context.supabase)
      .from("mimo_rep_comerciais_historico")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .eq("entidade", data.entidade)
      .eq("referencia", data.referencia)
      .order("id", { ascending: false })
      .limit(100);
    if (r.error) erroRpc(r.error, "Não foi possível carregar o histórico.");
    return r.data ?? [];
  });
