import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { exigirMimo } from "./mimo-leads.server";
import {
  podeGerirCodigos,
  podePreencherHistoricoCodigos,
  type CodigoCampanhaInput,
  type InvestimentoManualInput,
} from "./mimo-campanhas-codigos";
import { codigosDb, faltaMigracaoCodigos } from "./mimo-campanhas-codigos-db";

const NEGADO = "Somente administração, gestão e marketing gerenciam códigos de campanha.";
const INATIVO = "O cadastro de códigos de campanha ainda não foi ativado no banco.";

type ErroDb = { code?: string; message?: string } | null;

function traduzir(erro: ErroDb, padrao: string): Error {
  const msg = erro?.message ?? "";
  if (faltaMigracaoCodigos(erro)) return new Error(INATIVO);
  if (erro?.code === "42501") return new Error(NEGADO);
  if (msg.includes("meta_ja_vinculada"))
    return new Error("Uma das campanhas Meta já está vinculada a outro código.");
  if (erro?.code === "23505") return new Error("Já existe um código igual nesta empresa.");
  if (msg.includes("versao_desatualizada"))
    return new Error("O código foi alterado por outra pessoa. Reabra antes de salvar.");
  if (msg.includes("ja_anulado")) return new Error("Este investimento já foi anulado.");
  if (msg.includes("codigo_imutavel"))
    return new Error("O código não pode ser alterado depois de criado.");
  if (msg.includes("codigo_inexistente") || msg.includes("investimento_inexistente"))
    return new Error("Registro não encontrado. Atualize a página.");
  if (msg.includes("id_meta_invalido"))
    return new Error("Informe apenas IDs numéricos de campanha Meta.");
  if (msg.includes("dados_invalidos")) return new Error("Confira os campos e tente novamente.");
  return new Error(padrao);
}

export async function listarCodigosCampanha(db: SupabaseClient<Database>, userId: string) {
  const acesso = await exigirMimo(db, userId);
  const gestor = podeGerirCodigos(acesso.papel);
  const base = {
    papel: acesso.papel,
    podeGerir: gestor,
    podePreencherHistorico: podePreencherHistoricoCodigos(acesso.papel),
  };
  const c = codigosDb(db);
  const [codigos, vinculos] = await Promise.all([
    c
      .from("mimo_campanhas_codigos")
      .select("id,codigo,nome,descricao,ativo,versao,updated_at")
      .eq("empresa_id", acesso.empresaId)
      .order("codigo")
      .limit(1000),
    c
      .from("mimo_campanhas_codigos_meta")
      .select("codigo_id,campanha_id")
      .eq("empresa_id", acesso.empresaId)
      .order("campanha_id")
      .limit(5000),
  ]);
  if (faltaMigracaoCodigos(codigos.error) || faltaMigracaoCodigos(vinculos.error))
    return { ...base, disponivel: false as const, codigos: [], investimentos: [] };
  if (codigos.error || vinculos.error)
    throw new Error("Não foi possível carregar os códigos de campanha.");
  let investimentos: {
    id: string;
    codigo_id: string;
    competencia: string;
    valor_centavos: number;
    descricao: string;
    created_at: string;
    anulado_em: string | null;
    motivo_anulacao: string;
  }[] = [];
  if (gestor) {
    const r = await c
      .from("mimo_campanhas_codigos_investimentos")
      .select(
        "id,codigo_id,competencia,valor_centavos,descricao,created_at,anulado_em,motivo_anulacao",
      )
      .eq("empresa_id", acesso.empresaId)
      .order("competencia", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (r.error) throw new Error("Não foi possível carregar os investimentos manuais.");
    investimentos = (r.data ?? []).map((i) => ({ ...i, valor_centavos: Number(i.valor_centavos) }));
  }
  const porCodigo = new Map<string, string[]>();
  for (const v of vinculos.data ?? [])
    porCodigo.set(v.codigo_id, [...(porCodigo.get(v.codigo_id) ?? []), v.campanha_id]);
  return {
    ...base,
    disponivel: true as const,
    codigos: (codigos.data ?? []).map((k) => ({
      ...k,
      // Descrição e vínculos são de gestão; quem só escolhe o código no lead recebe código e nome.
      descricao: gestor ? k.descricao : "",
      campanhasMeta: gestor ? (porCodigo.get(k.id) ?? []) : [],
    })),
    investimentos,
  };
}
export type ListaCodigosCampanha = Awaited<ReturnType<typeof listarCodigosCampanha>>;

async function exigirGestor(db: SupabaseClient<Database>, userId: string) {
  const acesso = await exigirMimo(db, userId);
  if (!podeGerirCodigos(acesso.papel)) throw new Error(NEGADO);
  return acesso;
}

export async function salvarCodigoCampanha(
  db: SupabaseClient<Database>,
  userId: string,
  input: CodigoCampanhaInput,
) {
  const acesso = await exigirGestor(db, userId);
  const { data, error } = await codigosDb(db).rpc("mimo_codigo_campanha_salvar", {
    _empresa: acesso.empresaId,
    _id: input.id,
    _versao: input.versao,
    _codigo: input.codigo,
    _nome: input.nome,
    _descricao: input.descricao,
    _ativo: input.ativo,
    _campanhas_meta: input.campanhasMeta,
  });
  if (error) throw traduzir(error, "Não foi possível salvar o código. Nada foi alterado.");
  return data as { id: string; versao: number };
}

export async function lancarInvestimentoCodigo(
  db: SupabaseClient<Database>,
  userId: string,
  input: InvestimentoManualInput,
) {
  const acesso = await exigirGestor(db, userId);
  const { data, error } = await codigosDb(db).rpc("mimo_codigo_campanha_lancar_investimento", {
    _empresa: acesso.empresaId,
    _codigo: input.codigoId,
    _competencia: input.competencia,
    _valor_centavos: input.valorCentavos,
    _descricao: input.descricao,
  });
  if (error) throw traduzir(error, "Não foi possível lançar o investimento. Nada foi gravado.");
  return { id: data as string };
}

export async function anularInvestimentoCodigo(
  db: SupabaseClient<Database>,
  userId: string,
  input: { id: string; motivo: string },
) {
  const acesso = await exigirGestor(db, userId);
  const { error } = await codigosDb(db).rpc("mimo_codigo_campanha_anular_investimento", {
    _empresa: acesso.empresaId,
    _id: input.id,
    _motivo: input.motivo,
  });
  if (error) throw traduzir(error, "Não foi possível anular o investimento.");
  return { ok: true };
}

export async function preencherHistoricoCodigos(db: SupabaseClient<Database>, userId: string) {
  const acesso = await exigirMimo(db, userId);
  if (!podePreencherHistoricoCodigos(acesso.papel))
    throw new Error("Somente administração e gestão aplicam códigos aos leads antigos.");
  const { data, error } = await codigosDb(db).rpc("mimo_codigo_campanha_preencher_historico", {
    _empresa: acesso.empresaId,
  });
  if (error) throw traduzir(error, "Não foi possível aplicar os códigos aos leads antigos.");
  return { leads: Number(data ?? 0) };
}
