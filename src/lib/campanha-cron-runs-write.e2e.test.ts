/**
 * E2E: writes contra `campanha_cron_runs` via PostgREST.
 *
 * Confirma três camadas de defesa em produção real (não análise estática):
 *   1. `anon` — INSERT e UPDATE são rejeitados pelo PostgREST.
 *   2. `authenticated` (usuário logado) — mesmo comportamento: negado.
 *   3. `service_role` (o cron `process-campaigns`) — grava com sucesso.
 *
 * As duas últimas seções dependem de credenciais e são puladas quando as env
 * vars correspondentes não existem — mantém a suíte executável em CI offline
 * mas rígida sempre que as chaves estão disponíveis.
 *
 * Env vars usadas (todas opcionais, exceto a URL/anon key para (1)):
 *   VITE_SUPABASE_URL | SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY | SUPABASE_PUBLISHABLE_KEY
 *   SUPABASE_TEST_USER_EMAIL + SUPABASE_TEST_USER_PASSWORD  (para (2))
 *   SUPABASE_SERVICE_ROLE_KEY                                (para (3))
 */
import { describe, it, expect, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY;
const TEST_USER_EMAIL = process.env.SUPABASE_TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.SUPABASE_TEST_USER_PASSWORD;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasBase = Boolean(SUPABASE_URL && SUPABASE_ANON);
const hasUser = Boolean(hasBase && TEST_USER_EMAIL && TEST_USER_PASSWORD);
const hasService = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

const baseDescribe = hasBase ? describe : describe.skip;
const userDescribe = hasUser ? describe : describe.skip;
const serviceDescribe = hasService ? describe : describe.skip;

/** Erros esperados quando o PostgREST bloqueia: permissão negada (42501),
 *  policy check falha (P0001), ou qualquer 4xx equivalente. */
/** Códigos SQLSTATE / PostgREST considerados prova de bloqueio.
 *  - 42501: insufficient_privilege (GRANT ausente) — o que anon recebe hoje.
 *  - P0001: raise_exception (policy RESTRICTIVE `WITH CHECK (false)`).
 *  - 42P17/2200N: policy violations diversas — mantidas para robustez.
 *  - PGRST301/PGRST116: PostgREST equivalents (JWT/RLS). */
const DENY_CODES = new Set([
  "42501",
  "P0001",
  "42P17",
  "PGRST301",
  "PGRST116",
]);

type PgErr = { code?: string; message?: string } | null;

/** Retorna o code se for um code conhecido de bloqueio; senão null.
 *  Assertions abaixo comparam pelo code, não por texto — mensagens do
 *  PostgREST podem ser truncadas/localizadas e não são contrato estável. */
function denyCode(error: PgErr): string | null {
  if (!error?.code) return null;
  return DENY_CODES.has(error.code) ? error.code : null;
}

baseDescribe("campanha_cron_runs — writes negados para anon (PostgREST live)", () => {
  const anon: SupabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  it("rejeita INSERT anônimo com SQLSTATE 42501", async () => {
    const { data, error } = await anon
      .from("campanha_cron_runs")
      .insert({ campanhas_consideradas: 0, ok: true })
      .select();

    expect(data ?? []).toEqual([]);
    expect(error).not.toBeNull();
    // anon não tem GRANT INSERT → PostgREST responde exatamente 42501.
    expect(error!.code).toBe("42501");
    expect(denyCode(error)).toBe("42501");
  });

  it("rejeita UPDATE anônimo com SQLSTATE 42501", async () => {
    const { data, error } = await anon
      .from("campanha_cron_runs")
      .update({ ok: false })
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .select();

    expect(data ?? []).toEqual([]);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
    expect(denyCode(error)).toBe("42501");
  });
});


userDescribe(
  "campanha_cron_runs — writes negados para authenticated (PostgREST live)",
  () => {
    const authed: SupabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    afterAll(async () => {
      await authed.auth.signOut();
    });

    it("faz login com o usuário de teste", async () => {
      const { data, error } = await authed.auth.signInWithPassword({
        email: TEST_USER_EMAIL!,
        password: TEST_USER_PASSWORD!,
      });
      expect(error).toBeNull();
      expect(data.session).toBeTruthy();
    });

    it("rejeita INSERT autenticado", async () => {
      const { data, error } = await authed
        .from("campanha_cron_runs")
        .insert({ campanhas_consideradas: 0, ok: true })
        .select();

      expect(data ?? []).toEqual([]);
      expect(isDenied(error)).toBe(true);
    });

    it("rejeita UPDATE autenticado", async () => {
      const { data, error } = await authed
        .from("campanha_cron_runs")
        .update({ ok: false })
        .eq("id", "00000000-0000-0000-0000-000000000000")
        .select();

      if (error) {
        expect(isDenied(error)).toBe(true);
      } else {
        expect(data ?? []).toEqual([]);
      }
    });
  },
);

serviceDescribe(
  "campanha_cron_runs — service_role (cron) grava com sucesso",
  () => {
    const admin: SupabaseClient = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const insertedIds: string[] = [];

    afterAll(async () => {
      if (insertedIds.length === 0) return;
      await admin.from("campanha_cron_runs").delete().in("id", insertedIds);
    });

    it("INSERT via service_role grava a linha e devolve o id", async () => {
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("campanha_cron_runs")
        .insert({
          started_at: now,
          finished_at: now,
          duration_ms: 0,
          campanhas_consideradas: 0,
          campanhas_iniciadas: 0,
          leads_selecionados: 0,
          mensagens_enviadas: 0,
          concluidas: 0,
          pulados: 0,
          erros: 0,
          detalhes: [],
          ok: true,
          error_message: "[e2e-test] linha de verificação — deve ser apagada no cleanup",
        })
        .select("id")
        .single();

      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      if (data?.id) insertedIds.push(data.id);
    });

    it("UPDATE via service_role também é permitido", async () => {
      // Requer sucesso do teste anterior.
      const id = insertedIds[0];
      if (!id) throw new Error("teste anterior não gravou id — abortando UPDATE");

      const { error } = await admin
        .from("campanha_cron_runs")
        .update({ error_message: "[e2e-test] update ok" })
        .eq("id", id);

      expect(error).toBeNull();
    });
  },
);
