import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hashTokenMimo, numeroConectadoMimo } from "./mimo-whatsapp";
import { uazStatus } from "./uazapi.server";

type Table<T> = { Row: T; Insert: never; Update: never; Relationships: [] };
type DB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      mimo_recuperacao_config: Table<{ empresa_id: string; vinculo_id: string; ativo: boolean }>;
    };
    Functions: Database["public"]["Functions"] & {
      mimo_recuperacao_vinculo_ia: { Args: { _empresa: string }; Returns: string | null };
    };
  };
};
export async function remetentesRecuperacao(db: SupabaseClient<Database>, empresa: string) {
  const client = db as unknown as SupabaseClient<DB>;
  const [v, a, c] = await Promise.all([
    db.from("mimo_whatsapp_vinculos").select("*").eq("empresa_id", empresa),
    client.rpc("mimo_recuperacao_vinculo_ia", { _empresa: empresa }),
    client
      .from("mimo_recuperacao_config")
      .select("vinculo_id,ativo")
      .eq("empresa_id", empresa)
      .maybeSingle(),
  ]);
  if (v.error || a.error || c.error) throw Error("Não foi possível consultar os remetentes.");
  const linhas = v.data ?? [];
  const ia = linhas.find((l) => l.id === a.data);
  // Um vínculo da IA ausente impede a seleção: não presumir que a linha é diferente.
  const iaConhecida = !a.data || !!ia;
  return {
    selecionado: c.data?.vinculo_id ?? null,
    linhas: linhas
      .filter((l) => l.ativo)
      .map((l) => ({
        id: l.id,
        numero: l.numero_comercial,
        permitido:
          iaConhecida &&
          !("finalidade" in l && l.finalidade === "fechamento") &&
          !!numeroConectadoMimo(l.numero_comercial) &&
          l.id !== a.data &&
          (!ia ||
            numeroConectadoMimo(l.numero_comercial) !== numeroConectadoMimo(ia.numero_comercial)),
      })),
  };
}
export async function validarRemetenteRecuperacao(
  db: SupabaseClient<Database>,
  empresa: string,
  id: string,
  exigirSelecionado = false,
) {
  const opcoes = await remetentesRecuperacao(db, empresa);
  if (exigirSelecionado && opcoes.selecionado !== id)
    throw Error("O remetente da recuperação mudou; aguarde a próxima execução.");
  if (!opcoes.linhas.some((l) => l.id === id && l.permitido))
    throw Error("Selecione um número comercial diferente do número da IA de atendimento.");
}
export async function tokenRemetenteRecuperacao(
  db: SupabaseClient<Database>,
  empresa: string,
  id: string,
) {
  await validarRemetenteRecuperacao(db, empresa, id);
  const r = await db
    .from("mimo_whatsapp_vinculos")
    .select("*")
    .eq("empresa_id", empresa)
    .eq("id", id)
    .eq("ativo", true)
    .maybeSingle();
  const v = r.data;
  if (r.error || !v) throw Error("Confirme a conexão comercial novamente.");
  const p = v.instancia_id
    ? await db
        .from("uazapi_instancias")
        .select("token")
        .eq("id", v.instancia_id)
        .eq("user_id", v.owner_id)
        .maybeSingle()
    : await db.from("profiles").select("uazapi_instance_token").eq("id", v.owner_id).maybeSingle();
  const token = p.data && ("token" in p.data ? p.data.token : p.data.uazapi_instance_token);
  if (p.error || !token || (await hashTokenMimo(token)) !== v.token_sha256)
    throw Error("Confirme a conexão comercial novamente.");
  const [owners, instances] = await Promise.all([
    db.from("profiles").select("id").eq("uazapi_instance_token", token),
    db.from("uazapi_instancias").select("id,user_id").eq("token", token),
  ]);
  if (
    owners.error ||
    instances.error ||
    (v.instancia_id
      ? owners.data?.length !== 0 ||
        instances.data?.length !== 1 ||
        instances.data[0].id !== v.instancia_id ||
        instances.data[0].user_id !== v.owner_id
      : owners.data?.length !== 1 ||
        owners.data[0].id !== v.owner_id ||
        instances.data?.length !== 0)
  )
    throw Error("A identidade da conexão comercial precisa ser confirmada.");
  const s = await uazStatus(token, AbortSignal.timeout(7000));
  if (
    s.status !== "connected" ||
    numeroConectadoMimo(s.profileNumber) !== numeroConectadoMimo(v.numero_comercial)
  )
    throw Error("O WhatsApp selecionado precisa estar conectado.");
  return token;
}
