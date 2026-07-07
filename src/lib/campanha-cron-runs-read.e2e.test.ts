/**
 * E2E: reads contra `campanha_cron_runs` via PostgREST.
 *
 * Cobre três camadas simétricas ao teste de writes:
 *   1. `anon`            — SELECT sempre devolve zero linhas (sem GRANT + policy owner-only).
 *   2. `authenticated`   — SELECT devolve **somente** linhas cujo user_id == auth.uid()
 *                          (via policy `cron_runs_dono_select` + `is_dono`).
 *   3. `service_role`    — SELECT devolve tudo (RLS bypass) — é o que o cron precisa
 *                          para inspecionar execuções passadas ao processar.
 *
 * As seções (2) e (3) só rodam quando as credenciais correspondentes existem;
 * a suíte permanece verde em CI offline mas rigorosa quando as chaves estão presentes.
 *
 * Env vars usadas:
 *   VITE_SUPABASE_URL | SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY | SUPABASE_PUBLISHABLE_KEY
 *   SUPABASE_TEST_USER_EMAIL + SUPABASE_TEST_USER_PASSWORD  (para (2))
 *   SUPABASE_SERVICE_ROLE_KEY                                (para (3))
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
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
// combinação: precisamos do service_role para criar rows de OUTRO usuário
// e validar que o authenticated NÃO enxerga essas rows.
const crossDescribe = hasUser && hasService ? describe : describe.skip;

const TAG = "[e2e-read-test]";

baseDescribe("campanha_cron_runs — SELECT anon é sempre vazio", () => {
  const anon: SupabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  it("retorna zero linhas para caller não autenticado", async () => {
    const { data, error } = await anon
      .from("campanha_cron_runs")
      .select("id, user_id")
      .limit(10);

    // Sem GRANT + policy `cron_runs_dono_select` (só authenticated) => PostgREST
    // ou devolve erro de permissão, ou devolve lista vazia (RLS filtra tudo).
    if (error) {
      expect(
        error.code === "42501" ||
          error.code === "PGRST301" ||
          /permission denied|row-level security/i.test(error.message ?? ""),
      ).toBe(true);
    } else {
      expect(data ?? []).toEqual([]);
    }
  });
});

userDescribe(
  "campanha_cron_runs — SELECT authenticated devolve só as próprias linhas",
  () => {
    const authed: SupabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let userId: string | null = null;

    beforeAll(async () => {
      const { data, error } = await authed.auth.signInWithPassword({
        email: TEST_USER_EMAIL!,
        password: TEST_USER_PASSWORD!,
      });
      expect(error).toBeNull();
      expect(data.session).toBeTruthy();
      userId = data.user?.id ?? null;
      expect(userId).toBeTruthy();
    });

    afterAll(async () => {
      await authed.auth.signOut();
    });

    it("todas as linhas visíveis pertencem ao próprio usuário (is_dono / user_id = auth.uid())", async () => {
      const { data, error } = await authed
        .from("campanha_cron_runs")
        .select("id, user_id")
        .limit(100);

      expect(error).toBeNull();
      const rows = data ?? [];
      // Não afirmamos > 0 (usuário pode nunca ter rodado cron), mas AFIRMAMOS
      // que tudo que veio é dele. Uma única linha de outro user_id é vazamento.
      for (const row of rows) {
        // is_dono hoje só retorna true para o dono da conta, então na maioria
        // dos usuários de teste esperamos 0 rows — mas se houver, tem que ser suas.
        expect(row.user_id === null || row.user_id === userId).toBe(true);
      }
    });
  },
);

crossDescribe(
  "campanha_cron_runs — authenticated NÃO enxerga linhas de outros usuários",
  () => {
    const admin: SupabaseClient = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const authed: SupabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const insertedIds: string[] = [];
    const foreignUserId = "00000000-0000-0000-0000-0000000000ff";
    let ownUserId: string | null = null;

    beforeAll(async () => {
      const { data } = await authed.auth.signInWithPassword({
        email: TEST_USER_EMAIL!,
        password: TEST_USER_PASSWORD!,
      });
      ownUserId = data.user?.id ?? null;
      expect(ownUserId).toBeTruthy();

      // Cria via service_role uma linha "de outro usuário" — deve ficar invisível
      // para o usuário autenticado.
      const now = new Date().toISOString();
      const { data: inserted, error } = await admin
        .from("campanha_cron_runs")
        .insert({
          user_id: foreignUserId,
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
          error_message: `${TAG} isolamento entre usuários`,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      if (inserted?.id) insertedIds.push(inserted.id);
    });

    afterAll(async () => {
      if (insertedIds.length > 0) {
        await admin.from("campanha_cron_runs").delete().in("id", insertedIds);
      }
      await authed.auth.signOut();
    });

    it("query filtrando pelo id de outro usuário retorna vazio", async () => {
      const foreignId = insertedIds[0];
      expect(foreignId).toBeTruthy();

      const { data, error } = await authed
        .from("campanha_cron_runs")
        .select("id, user_id")
        .eq("id", foreignId!);

      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    });

    it("query filtrando pelo user_id de outro usuário retorna vazio", async () => {
      const { data, error } = await authed
        .from("campanha_cron_runs")
        .select("id, user_id")
        .eq("user_id", foreignUserId);

      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    });
  },
);

serviceDescribe(
  "campanha_cron_runs — service_role (cron) lê tudo que precisa",
  () => {
    const admin: SupabaseClient = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const insertedIds: string[] = [];

    afterAll(async () => {
      if (insertedIds.length > 0) {
        await admin.from("campanha_cron_runs").delete().in("id", insertedIds);
      }
    });

    it("SELECT via service_role devolve as linhas seed (bypass RLS)", async () => {
      // Seed: garante que existe pelo menos 1 linha visível para o cron.
      const now = new Date().toISOString();
      const { data: seed, error: seedError } = await admin
        .from("campanha_cron_runs")
        .insert({
          started_at: now,
          finished_at: now,
          duration_ms: 1,
          campanhas_consideradas: 0,
          campanhas_iniciadas: 0,
          leads_selecionados: 0,
          mensagens_enviadas: 0,
          concluidas: 0,
          pulados: 0,
          erros: 0,
          detalhes: [],
          ok: true,
          error_message: `${TAG} seed leitura cron`,
        })
        .select("id")
        .single();
      expect(seedError).toBeNull();
      if (seed?.id) insertedIds.push(seed.id);

      // Agora o cron consulta como faz em produção: filtro por marcador + ordem.
      const { data, error } = await admin
        .from("campanha_cron_runs")
        .select(
          "id, started_at, finished_at, duration_ms, ok, error_message, campanhas_iniciadas",
        )
        .eq("error_message", `${TAG} seed leitura cron`)
        .order("started_at", { ascending: false })
        .limit(5);

      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
      expect(data![0]!.id).toBe(seed!.id);
    });
  },
);
