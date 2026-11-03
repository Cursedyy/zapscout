import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  unidadeSchema,
  atividadeSchema,
  contatoSchema,
  filtrosCarteiraSchema,
  limitesDiaCarteira,
  type UnidadeLista,
  type Unidade,
  type Atividade,
  type Contato,
  type HistoricoCarteira,
} from "./mimo-carteira";
import { cnpjValido } from "./mimo-carteira-importacao";
import type { Database, Json } from "@/integrations/supabase/types";

type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
type Vinculo = {
  empresa_id: string;
  unidade_id: string;
  contato_id: string;
  papel: Contato["papel"];
};
type Negociacao = { empresa_id: string; unidade_id: string; lead_id: string };
type Importacao = {
  id: string;
  hash: string;
  total: number;
  processados: number;
  criados: number;
  ignorados: number;
  concluida_em: string | null;
  created_at: string;
};
type Rpc = { Args: { _empresa: string; _dados: Json }; Returns: Json };
type CarteiraDB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      mimo_carteira_unidades: Table<Unidade>;
      mimo_carteira_lista: Table<UnidadeLista>;
      mimo_carteira_atividades: Table<Atividade & { empresa_id: string }>;
      mimo_carteira_contatos: Table<Omit<Contato, "unidade_id" | "papel"> & { empresa_id: string }>;
      mimo_carteira_contato_unidades: Table<Vinculo>;
      mimo_carteira_historico: Table<
        HistoricoCarteira & { empresa_id: string; unidade_id: string }
      >;
      mimo_carteira_negociacoes: Table<Negociacao>;
      mimo_carteira_importacoes: Table<Importacao & { empresa_id: string }>;
      mimo_carteira_importacao_linhas: Table<{
        importacao_id: string;
        linha: number;
        payload: Json;
        unidade_id: string | null;
        resultado: string;
      }>;
    };
    Functions: Database["public"]["Functions"] & {
      mimo_carteira_gravar: Rpc;
      mimo_carteira_atividade: Rpc;
      mimo_carteira_contato: Rpc;
      mimo_carteira_atribuir: Rpc;
      mimo_carteira_negociar: Rpc;
      mimo_carteira_importar: Rpc;
    };
  };
};
const client = (db: SupabaseClient<Database>) => db as unknown as SupabaseClient<CarteiraDB>;
async function acesso(db: SupabaseClient<Database>, user: string, gestao = false) {
  const { exigirMimo } = await import("./mimo-leads.server");
  const a = await exigirMimo(db, user);
  if (!["administrador", "gestor", ...(gestao ? [] : ["vendedor"])].includes(a.papel))
    throw Error("Acesso negado.");
  return a;
}
const buscaSegura = (s: string) => s.replace(/[^\p{L}\p{N}\s-]/gu, " ").trim();
const ausente = (error: { code?: string } | null) =>
  error?.code === "42P01" || error?.code === "PGRST205";
async function unidadeAutorizada(db: SupabaseClient<Database>, user: string, id: string) {
  const a = await acesso(db, user);
  let q = client(db)
    .from("mimo_carteira_unidades")
    .select("*")
    .eq("empresa_id", a.empresaId)
    .eq("id", id);
  if (a.papel === "vendedor") q = q.eq("responsavel_id", user);
  const r = await q.single();
  if (r.error || !r.data) throw Error("Unidade indisponível.");
  return { a, unidade: r.data };
}
async function rpc(
  db: SupabaseClient<Database>,
  nome: keyof CarteiraDB["public"]["Functions"] &
    (
      | "mimo_carteira_gravar"
      | "mimo_carteira_atividade"
      | "mimo_carteira_contato"
      | "mimo_carteira_atribuir"
      | "mimo_carteira_negociar"
      | "mimo_carteira_importar"
    ),
  empresa: string,
  dados: Json,
) {
  const r = await client(db).rpc(nome, { _empresa: empresa, _dados: dados });
  if (r.error)
    throw Error(
      "Não foi possível concluir. Confira os dados e permissões ou reabra a ficha para atualizar.",
    );
  return r.data;
}

export const listarCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => filtrosCarteiraSchema.parse(v))
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId);
    let q = client(context.supabase)
      .from("mimo_carteira_lista")
      .select(
        "id,empresa_id,nome,cnpj,rede,grupo,razao_social,canal,cidade,uf,instagram,classe,situacao,responsavel_id,updated_at,proxima_acao,ultimo_contato",
        { count: "exact" },
      )
      .eq("empresa_id", a.empresaId);
    if (a.papel === "vendedor") q = q.eq("responsavel_id", context.userId);
    const busca = buscaSegura(data.busca);
    if (busca)
      q = q.or(
        `nome.ilike.%${busca}%,rede.ilike.%${busca}%,cidade.ilike.%${busca}%,cnpj.ilike.%${busca}%`,
      );
    if (data.classe) q = q.eq("classe", data.classe === "sem" ? "" : data.classe);
    if (data.situacao) q = q.eq("situacao", data.situacao);
    for (const k of ["rede", "grupo", "cidade"] as const) {
      const s = buscaSegura(data[k]);
      if (s) q = q.ilike(k, `%${s}%`);
    }
    if (data.uf) q = q.eq("uf", data.uf.toUpperCase());
    if (data.responsavel === "sem") q = q.is("responsavel_id", null);
    else if (data.responsavel) q = q.eq("responsavel_id", data.responsavel);
    const dia = limitesDiaCarteira();
    if (data.agenda === "hoje") q = q.gte("proxima_acao", dia.inicio).lt("proxima_acao", dia.fim);
    if (data.agenda === "atrasados") q = q.lt("proxima_acao", new Date().toISOString());
    if (data.agenda === "sem") q = q.is("proxima_acao", null);
    const r = await q
      .order("nome")
      .order("id")
      .range(data.pagina * 30, data.pagina * 30 + 29);
    if (r.error) {
      if (ausente(r.error)) return { unidades: [], total: 0, disponivel: false };
      throw Error("Não foi possível carregar a carteira.");
    }
    return { unidades: r.data ?? [], total: r.count ?? 0, disponivel: true };
  });
export const gravarUnidadeMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => unidadeSchema.parse(v))
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId);
    const cnpj = data.cnpj.replace(/\D/g, "");
    if (cnpj && !cnpjValido(cnpj)) throw Error("CNPJ inválido.");
    return rpc(context.supabase, "mimo_carteira_gravar", a.empresaId, { ...data, cnpj });
  });
export const detalheCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) =>
    z.object({ id: z.string().uuid(), pagina: z.number().int().min(0).default(0) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { a, unidade } = await unidadeAutorizada(context.supabase, context.userId, data.id);
    const db = client(context.supabase);
    const [vinculos, atividades, historico, negociacoes] = await Promise.all([
      db
        .from("mimo_carteira_contato_unidades")
        .select("*")
        .eq("empresa_id", a.empresaId)
        .eq("unidade_id", data.id),
      db
        .from("mimo_carteira_atividades")
        .select("*", { count: "exact" })
        .eq("empresa_id", a.empresaId)
        .eq("unidade_id", data.id)
        .order("prazo", { ascending: false })
        .order("id")
        .range(data.pagina * 30, data.pagina * 30 + 29),
      db
        .from("mimo_carteira_historico")
        .select("id,acao,created_at,antes,depois", { count: "exact" })
        .eq("empresa_id", a.empresaId)
        .eq("unidade_id", data.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(data.pagina * 30, data.pagina * 30 + 29),
      db
        .from("mimo_carteira_negociacoes")
        .select("*")
        .eq("empresa_id", a.empresaId)
        .eq("unidade_id", data.id)
        .limit(100),
    ]);
    if ([vinculos, atividades, historico, negociacoes].some((r) => r.error))
      throw Error("Não foi possível carregar a ficha.");
    const ids = (vinculos.data ?? []).map((v) => v.contato_id);
    const contatos = ids.length
      ? await db
          .from("mimo_carteira_contatos")
          .select("*")
          .eq("empresa_id", a.empresaId)
          .in("id", ids)
      : { data: [], error: null };
    if (contatos.error) throw Error("Não foi possível carregar contatos.");
    const leadsIds = (negociacoes.data ?? []).map((n) => n.lead_id);
    const [leads, links] = leadsIds.length
      ? await Promise.all([
          context.supabase
            .from("mimo_leads")
            .select("id,nome_empresa,etapa")
            .eq("empresa_id", a.empresaId)
            .in("id", leadsIds),
          db
            .from("mimo_carteira_negociacoes")
            .select("*")
            .eq("empresa_id", a.empresaId)
            .in("lead_id", leadsIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (leads.error || links.error) throw Error("Não foi possível carregar negociações.");
    const unidadesIds = [...new Set((links.data ?? []).map((l) => l.unidade_id))];
    const unidades = unidadesIds.length
      ? await db
          .from("mimo_carteira_unidades")
          .select("id,nome")
          .eq("empresa_id", a.empresaId)
          .in("id", unidadesIds)
      : { data: [], error: null };
    if (unidades.error) throw Error("Não foi possível carregar unidades.");
    const { tiraClient } = await import("./mimo-pedido-db");
    const pedidos = leadsIds.length
      ? await tiraClient(context.supabase)
          .from("mimo_tira_pedidos_seguros")
          .select("id,lead_id,numero,status,total")
          .eq("empresa_id", a.empresaId)
          .in("lead_id", leadsIds)
          .order("updated_at", { ascending: false })
          .limit(100)
      : { data: [], error: null };
    if (pedidos.error && !ausente(pedidos.error)) throw Error("Não foi possível carregar pedidos.");
    return {
      unidade,
      contatos: (contatos.data ?? []).map((c) => ({
        ...c,
        unidade_id: data.id,
        papel: vinculos.data!.find((v) => v.contato_id === c.id)!.papel,
      })),
      atividades: atividades.data ?? [],
      totalAtividades: atividades.count ?? 0,
      historico: historico.data ?? [],
      totalHistorico: historico.count ?? 0,
      negociacoes: (leads.data ?? []).map((l) => ({
        lead_id: l.id,
        nome: l.nome_empresa,
        etapa: l.etapa,
        unidades: (unidades.data ?? []).filter((u) =>
          links.data?.some((v) => v.lead_id === l.id && v.unidade_id === u.id),
        ),
        pedidos: (pedidos.data ?? []).filter((p) => p.lead_id === l.id),
      })),
    };
  });
export const gravarContatoCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => contatoSchema.parse(v))
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId);
    return rpc(context.supabase, "mimo_carteira_contato", a.empresaId, data);
  });
export const associarContatoCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) =>
    z
      .object({
        id: z.string().uuid(),
        unidade_id: z.string().uuid(),
        papel: z.enum(["Proprietário", "Comprador", "Outro"]),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId, true);
    return rpc(context.supabase, "mimo_carteira_contato", a.empresaId, {
      ...data,
      operacao: "associar",
    });
  });
export const buscarContatosCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ busca: z.string().min(2).max(200) }).parse(v))
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId, true);
    const busca = buscaSegura(data.busca);
    if (!busca) return [];
    const r = await client(context.supabase)
      .from("mimo_carteira_contatos")
      .select("id,nome,telefone,whatsapp,email")
      .eq("empresa_id", a.empresaId)
      .or(`nome.ilike.%${busca}%,telefone.ilike.%${busca}%`)
      .limit(20);
    if (r.error) throw Error("Não foi possível buscar contatos.");
    return r.data;
  });
export const atividadesCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { a } = await unidadeAutorizada(context.supabase, context.userId, data.id);
    const r = await client(context.supabase)
      .from("mimo_carteira_atividades")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .eq("unidade_id", data.id)
      .order("prazo", { ascending: false })
      .limit(50);
    if (r.error) throw Error("Não foi possível carregar atividades.");
    return r.data;
  });
export const agendarCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => atividadeSchema.parse(v))
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId);
    return rpc(context.supabase, "mimo_carteira_atividade", a.empresaId, data);
  });
export const concluirCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) =>
    z
      .object({
        id: z.string().uuid(),
        unidade_id: z.string().uuid(),
        resultado: z.string().trim().min(1).max(2000),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId);
    return rpc(context.supabase, "mimo_carteira_atividade", a.empresaId, data);
  });
export const reagendarCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) =>
    z
      .object({
        id: z.string().uuid(),
        unidade_id: z.string().uuid(),
        prazo: z.string().datetime(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId);
    return rpc(context.supabase, "mimo_carteira_atividade", a.empresaId, {
      ...data,
      operacao: "reagendar",
    });
  });
export const atribuirCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(100),
        responsavel_id: z.string().uuid().nullable(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId, true);
    return rpc(context.supabase, "mimo_carteira_atribuir", a.empresaId, data);
  });
export const negociarCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) =>
    z
      .object({
        unidades: z.array(z.string().uuid()).min(1).max(100),
        principal: z.string().uuid(),
        operacao_id: z.string().uuid(),
        lead_id: z.string().uuid().nullable().default(null),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId);
    return rpc(context.supabase, "mimo_carteira_negociar", a.empresaId, data);
  });
export const buscarLeadsCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ busca: z.string().max(200) }).parse(v))
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId);
    let q = context.supabase
      .from("mimo_leads")
      .select("id,nome_empresa,etapa")
      .eq("empresa_id", a.empresaId);
    if (a.papel === "vendedor") q = q.eq("responsavel_id", context.userId);
    const busca = buscaSegura(data.busca);
    if (busca) q = q.ilike("nome_empresa", `%${busca}%`);
    const r = await q.order("updated_at", { ascending: false }).limit(20);
    if (r.error) throw Error("Não foi possível buscar leads.");
    return r.data;
  });
const linhaImportacao = z.object({
  linha: z.number().int().min(1).max(100000),
  unidade: unidadeSchema.omit({ id: true, updated_at: true }),
  contatos: z
    .array(contatoSchema.innerType().omit({ id: true, updated_at: true, unidade_id: true }))
    .max(10),
  originais: z.record(z.string().max(5000)).refine((r) => Object.keys(r).length <= 100),
});
export const importarCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) =>
    z
      .object({
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        plano_hash: z.string().regex(/^[a-f0-9]{64}$/),
        total: z.number().int().min(1).max(10000),
        linhas: z.array(linhaImportacao).min(1).max(50),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId, true);
    for (const l of data.linhas) {
      const c = l.unidade.cnpj;
      if (c && !cnpjValido(c)) throw Error(`CNPJ inválido na linha ${l.linha}.`);
    }
    const r = await rpc(context.supabase, "mimo_carteira_importar", a.empresaId, data);
    return z
      .object({
        processados: z.number(),
        total: z.number(),
        criados: z.number(),
        ignorados: z.number(),
        concluida_em: z.string().nullable(),
      })
      .parse(r);
  });
export const importacoesCarteiraMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await acesso(context.supabase, context.userId, true);
    const r = await client(context.supabase)
      .from("mimo_carteira_importacoes")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (ausente(r.error)) return [];
    if (r.error) throw Error("Não foi possível carregar importações.");
    return r.data;
  });

export const obterLeadCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId);
    let q = context.supabase
      .from("mimo_leads")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .eq("id", data.id);
    if (a.papel === "vendedor") q = q.eq("responsavel_id", context.userId);
    const r = await q.single();
    if (r.error) throw Error("Lead indisponível.");
    return r.data;
  });

export const resultadosImportacaoCarteiraMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) =>
    z.object({ id: z.string().uuid(), pagina: z.number().int().min(0).default(0) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const a = await acesso(context.supabase, context.userId, true);
    const db = client(context.supabase);
    const job = await db
      .from("mimo_carteira_importacoes")
      .select("id")
      .eq("empresa_id", a.empresaId)
      .eq("id", data.id)
      .single();
    if (job.error) throw Error("Importação indisponível.");
    const r = await db
      .from("mimo_carteira_importacao_linhas")
      .select("linha,resultado,payload", { count: "exact" })
      .eq("importacao_id", data.id)
      .order("linha")
      .range(data.pagina * 30, data.pagina * 30 + 29);
    if (r.error) throw Error("Não foi possível carregar o resultado.");
    return {
      total: r.count ?? 0,
      linhas: (r.data ?? []).map((l) => ({
        linha: l.linha,
        resultado: l.resultado,
        nome: z.object({ unidade: z.object({ nome: z.string() }) }).parse(l.payload).unidade.nome,
      })),
    };
  });
