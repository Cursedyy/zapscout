/**
 * Regression tests for RLS on `campanha_cron_runs`.
 *
 * Ensures the table stays locked down to the owner (`is_dono(auth.uid())`)
 * and that no permissive `USING (true)` policy is re-introduced.
 *
 * The suite mixes two layers:
 *  1. Static scan of migration files — deterministic, no network.
 *  2. Live check via the anon Supabase client — verifies PostgREST actually
 *     denies reads for unauthenticated callers.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readAllMigrations(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      sql: readFileSync(join(MIGRATIONS_DIR, file), "utf8"),
    }));
}

describe("campanha_cron_runs RLS (static migration scan)", () => {
  const migrations = readAllMigrations();
  const touching = migrations.filter((m) =>
    m.sql.includes("campanha_cron_runs"),
  );

  it("has at least one migration touching the table", () => {
    expect(touching.length).toBeGreaterThan(0);
  });

  it("enables row level security on the table", () => {
    const hasEnable = touching.some((m) =>
      /ALTER\s+TABLE\s+public\.campanha_cron_runs\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(
        m.sql,
      ),
    );
    expect(hasEnable).toBe(true);
  });

  it("defines an owner-scoped SELECT policy using is_dono(auth.uid())", () => {
    const ownerPolicy = touching.some((m) =>
      /CREATE\s+POLICY[\s\S]+?ON\s+public\.campanha_cron_runs[\s\S]+?FOR\s+SELECT[\s\S]+?USING\s*\(\s*is_dono\s*\(\s*auth\.uid\(\)\s*\)\s*\)/i.test(
        m.sql,
      ),
    );
    expect(ownerPolicy).toBe(true);
  });

  it("does not introduce a permissive USING (true) policy on the table", () => {
    // We look at the net effect: any permissive policy must be dropped in a later migration.
    const created = new Set<string>();
    for (const m of touching) {
      const createMatches = m.sql.matchAll(
        /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+public\.campanha_cron_runs[\s\S]+?USING\s*\(\s*true\s*\)/gi,
      );
      for (const match of createMatches) created.add(match[1]);

      const dropMatches = m.sql.matchAll(
        /DROP\s+POLICY(?:\s+IF\s+EXISTS)?\s+"([^"]+)"\s+ON\s+public\.campanha_cron_runs/gi,
      );
      for (const match of dropMatches) created.delete(match[1]);
    }
    expect(Array.from(created)).toEqual([]);
  });

  it("does not GRANT SELECT on the table to anon", () => {
    const anonGrant = touching.some((m) =>
      /GRANT[^;]*SELECT[^;]*ON\s+public\.campanha_cron_runs[^;]*TO\s+anon/i.test(
        m.sql,
      ),
    );
    expect(anonGrant).toBe(false);
  });
});

// Live check: uses the anon key to hit PostgREST directly. Skipped when
// env vars are unavailable (e.g. offline CI without secrets).
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY;

const liveDescribe =
  SUPABASE_URL && SUPABASE_ANON ? describe : describe.skip;

liveDescribe("campanha_cron_runs RLS (live anon client)", () => {
  const anon = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  it("returns zero rows to an unauthenticated caller", async () => {
    const { data, error } = await anon
      .from("campanha_cron_runs")
      .select("id")
      .limit(5);

    // RLS should filter everything out (data: []). PostgREST may also return
    // a permission error depending on grant/policy interaction — either
    // outcome proves the caller cannot read rows.
    if (error) {
      expect(error.code === "42501" || error.message.length > 0).toBe(true);
    } else {
      expect(data ?? []).toEqual([]);
    }
  });
});
